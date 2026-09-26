import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { pickRenditions, probeVideo, transcodeToHls, rewritePlaylist, publishHls, extractFrame, mapLimit } from "../src/services/hls.service.js";

const work = fs.mkdtempSync(path.join(os.tmpdir(), "vv-hls-"));
const makeClip = (name, { width, height, seconds, audio }) => {
    const file = path.join(work, name);
    const args = ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=${width}x${height}:rate=25`];
    if (audio) args.push("-f", "lavfi", "-i", `sine=duration=${seconds}`, "-shortest");
    execFileSync(ffmpegPath, [...args, "-pix_fmt", "yuv420p", file]);
    return file;
};

describe("rendition ladder", () => {
    it.each([
        [1080, ["360p", "720p", "1080p"]],
        [720, ["360p", "720p"]],
        [480, ["360p"]],
        [144, ["144p"]],
        [143, ["142p"]],
    ])("a %ip source gets %j (never upscaled)", (height, names) => {
        expect(pickRenditions(height).map((r) => r.name)).toEqual(names);
    });
});

describe("playlist rewriting", () => {
    it("replaces uri lines and keeps tags", () => {
        const text = "#EXTM3U\n#EXTINF:6.0,\nseg_000.ts\n#EXTINF:2.0,\nseg_001.ts\n#EXT-X-ENDLIST\n";
        const out = rewritePlaylist(text, (uri) => `https://cdn/${uri}`);
        expect(out.split("\n").filter((l) => l && !l.startsWith("#"))).toEqual(["https://cdn/seg_000.ts", "https://cdn/seg_001.ts"]);
        expect(out).toContain("#EXT-X-ENDLIST");
    });

    it("refuses a playlist that references a file that was not uploaded", () => {
        expect(() => rewritePlaylist("#EXTM3U\nseg_000.ts\n", () => undefined)).toThrow(/unknown file: seg_000.ts/);
    });

    it("mapLimit keeps order and never exceeds the limit", async () => {
        let inFlight = 0, peak = 0;
        const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
            peak = Math.max(peak, ++inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
            return n * 10;
        });
        expect(out).toEqual([10, 20, 30, 40, 50, 60]);
        expect(peak).toBe(2);
    });
});

describe("adaptive HLS with real ffmpeg", () => {
    let hd, silent, tiny;
    beforeAll(() => {
        hd = makeClip("hd.mp4", { width: 1280, height: 720, seconds: 14, audio: true });
        silent = makeClip("silent.mp4", { width: 854, height: 480, seconds: 8, audio: false });
        tiny = makeClip("tiny.mp4", { width: 176, height: 144, seconds: 3, audio: true });
    }, 120000);
    afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

    it("probes duration, size and audio", async () => {
        expect(await probeVideo(hd)).toMatchObject({ width: 1280, height: 720, hasAudio: true });
        expect((await probeVideo(hd)).duration).toBeCloseTo(14, 0);
        expect((await probeVideo(silent)).hasAudio).toBe(false);
    });

    it("writes a master playlist with one variant per rendition and aligned segments", async () => {
        const out = path.join(work, "hd");
        const ladder = await transcodeToHls(hd, out, pickRenditions(720), true);
        const master = fs.readFileSync(ladder.masterPath, "utf8");

        expect(master.match(/#EXT-X-STREAM-INF/g)).toHaveLength(2);
        expect(master).toMatch(/RESOLUTION=640x360/);
        expect(master).toMatch(/RESOLUTION=1280x720/);
        expect(master).toContain("360p/index.m3u8");
        expect(master).toContain("720p/index.m3u8");
        // 14s at 6s segments = 3 segments in each rendition, cut at the same points
        const counts = ladder.renditions.map((r) => r.segmentPaths.length);
        expect(counts).toEqual([3, 3]);
        const durations = ladder.renditions.map((r) => fs.readFileSync(r.playlistPath, "utf8").match(/#EXTINF:([\d.]+)/g));
        expect(durations[0]).toEqual(durations[1]);
    }, 120000);

    it("handles sources without audio and sources smaller than the ladder", async () => {
        const noAudio = await transcodeToHls(silent, path.join(work, "silent"), pickRenditions(480), false);
        expect(noAudio.renditions.map((r) => r.name)).toEqual(["360p"]);
        expect(noAudio.renditions[0].segmentPaths.length).toBeGreaterThan(0);

        const small = await transcodeToHls(tiny, path.join(work, "tiny"), pickRenditions(144), true);
        expect(fs.readFileSync(small.masterPath, "utf8")).toMatch(/RESOLUTION=176x144/);
    }, 120000);

    it("extracts a thumbnail frame", async () => {
        const out = await extractFrame(hd, path.join(work, "thumb.jpg"), 5);
        expect(fs.statSync(out).size).toBeGreaterThan(1000);
    }, 60000);

    it("publishes segments, then rendition playlists, then the master pointing at the uploaded playlists", async () => {
        const ladder = await transcodeToHls(hd, path.join(work, "publish"), pickRenditions(720), true);
        const uploads = [];
        const uploadFile = async (file, { resourceType, folder }) => {
            uploads.push({ name: path.basename(file), resourceType, folder });
            return `https://cdn.test/${folder}/${path.basename(file)}`;
        };

        const masterUrl = await publishHls(ladder, "videos/abc", uploadFile);
        expect(masterUrl).toBe("https://cdn.test/videos/abc/master.m3u8");

        const segments = uploads.filter((u) => u.name.endsWith(".ts"));
        expect(segments).toHaveLength(6);
        expect(new Set(segments.map((s) => s.folder))).toEqual(new Set(["videos/abc/360p", "videos/abc/720p"]));
        expect(uploads.filter((u) => u.resourceType === "raw").map((u) => `${u.folder}/${u.name}`)).toEqual([
            "videos/abc/360p/index.m3u8", "videos/abc/720p/index.m3u8", "videos/abc/master.m3u8",
        ]);

        const master = fs.readFileSync(ladder.masterPath, "utf8");
        expect(master).toContain("https://cdn.test/videos/abc/720p/index.m3u8");
        const rendition = fs.readFileSync(ladder.renditions[1].playlistPath, "utf8");
        expect(rendition).toContain("https://cdn.test/videos/abc/720p/seg_000.ts");
    }, 120000);
});
