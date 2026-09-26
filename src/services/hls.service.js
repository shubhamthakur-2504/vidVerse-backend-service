import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import Ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import "../utils/utils.js"; // configures the ffmpeg / ffprobe binary paths used by fluent-ffmpeg (probe, frames)

// Adaptive-bitrate HLS built with our own ffmpeg:
//   probe -> pick a ladder (never upscale) -> one ffmpeg pass writing every rendition + a master playlist
//   -> upload segments and playlists -> rewrite playlists to the uploaded urls.

// bitrates follow common streaming ladders for H.264 at 30fps
export const LADDER = [
    { name: "1080p", height: 1080, videoBitrate: "5000k", maxrate: "5350k", bufsize: "7500k", audioBitrate: "192k" },
    { name: "720p", height: 720, videoBitrate: "2800k", maxrate: "2996k", bufsize: "4200k", audioBitrate: "128k" },
    { name: "360p", height: 360, videoBitrate: "800k", maxrate: "856k", bufsize: "1200k", audioBitrate: "96k" },
];

export const SEGMENT_SECONDS = 6;

export const probeVideo = (inputPath) =>
    new Promise((resolve, reject) => {
        Ffmpeg(inputPath).ffprobe((err, data) => {
            if (err) return reject(err);
            const video = data.streams.find((s) => s.codec_type === "video");
            if (!video) return reject(new Error("the file has no video stream"));
            resolve({
                duration: Number(data.format.duration) || 0,
                width: video.width,
                height: video.height,
                hasAudio: data.streams.some((s) => s.codec_type === "audio"),
            });
        });
    });

// every rung at or below the source height, lowest first; tiny sources get a single rendition at their own size
export const pickRenditions = (sourceHeight) => {
    const fitting = LADDER.filter((r) => r.height <= sourceHeight).reverse();
    if (fitting.length) return fitting;
    const height = Math.max(2, sourceHeight - (sourceHeight % 2)); // x264 needs even dimensions
    return [{ ...LADDER[LADDER.length - 1], name: `${height}p`, height }];
};

// runs the ffmpeg binary directly: fluent-ffmpeg splits option values on spaces, which breaks -var_stream_map
const runFfmpeg = (args) =>
    new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
        child.on("error", reject);
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`))));
    });

// the ffmpeg arguments for one pass that splits the video, scales each copy and encodes every rendition
export const hlsArgs = (inputPath, outputDir, renditions, hasAudio) => {
    // forward slashes work for ffmpeg on every OS and keep the uris inside master.m3u8 portable ("720p/index.m3u8")
    const out = outputDir.replace(/\\/g, "/");
    const split = `[0:v]split=${renditions.length}${renditions.map((_, i) => `[v${i}]`).join("")}`;
    const scales = renditions.map((r, i) => `[v${i}]scale=-2:${r.height}[v${i}out]`);
    const args = ["-i", inputPath, "-filter_complex", [split, ...scales].join(";")];

    renditions.forEach((r, i) => {
        args.push("-map", `[v${i}out]`, `-c:v:${i}`, "libx264", `-b:v:${i}`, r.videoBitrate, `-maxrate:v:${i}`, r.maxrate, `-bufsize:v:${i}`, r.bufsize);
        if (hasAudio) args.push("-map", "a:0", `-c:a:${i}`, "aac", `-b:a:${i}`, r.audioBitrate, `-ac:a:${i}`, "2");
    });

    args.push(
        "-preset", "veryfast",
        "-profile:v", "main",
        "-pix_fmt", "yuv420p",
        // identical keyframe positions in every rendition so the player can switch between them per segment
        "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
        "-sc_threshold", "0",
        "-f", "hls",
        "-hls_time", String(SEGMENT_SECONDS),
        "-hls_playlist_type", "vod",
        "-hls_list_size", "0",
        "-hls_segment_filename", `${out}/%v/seg_%03d.ts`,
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", renditions.map((r, i) => (hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`)).join(" "),
        `${out}/%v/index.m3u8`
    );
    return args;
};

// one ffmpeg pass writing every rendition (outputDir/<name>/index.m3u8 + seg_NNN.ts) and outputDir/master.m3u8
export const transcodeToHls = async (inputPath, outputDir, renditions, hasAudio) => {
    for (const r of renditions) fs.mkdirSync(path.join(outputDir, r.name), { recursive: true });
    await runFfmpeg(hlsArgs(inputPath, outputDir, renditions, hasAudio));
    return {
        masterPath: path.join(outputDir, "master.m3u8"),
        renditions: renditions.map((r) => {
            const dir = path.join(outputDir, r.name);
            return {
                ...r,
                playlistPath: path.join(dir, "index.m3u8"),
                segmentPaths: fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).sort().map((f) => path.join(dir, f)),
            };
        }),
    };
};

// a single frame as a jpg (used when the uploader gave no thumbnail)
export const extractFrame = (inputPath, outputPath, atSeconds) =>
    new Promise((resolve, reject) => {
        Ffmpeg(inputPath)
            .on("end", () => (fs.existsSync(outputPath) ? resolve(outputPath) : reject(new Error(`no frame at ${atSeconds}s`))))
            .on("error", reject)
            .screenshots({ count: 1, timemarks: [String(atSeconds)], folder: path.dirname(outputPath), filename: path.basename(outputPath), size: "1280x?" });
    });

// replace every uri line of a playlist; resolve(uri) must return the new url (throws for unknown uris)
export const rewritePlaylist = (text, resolve) =>
    text
        .split(/\r?\n/)
        .map((line) => {
            const uri = line.trim().replace(/\\/g, "/");
            if (!uri || uri.startsWith("#")) return line;
            const url = resolve(uri);
            if (!url) throw new Error(`playlist references an unknown file: ${uri}`);
            return url;
        })
        .join("\n");

// run fn over items with at most `limit` in flight
export const mapLimit = async (items, limit, fn) => {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
};

// upload a transcoded ladder; uploadFile(path, { resourceType, folder }) -> url. Returns the master playlist url.
export const publishHls = async (ladder, folder, uploadFile, { concurrency = 4 } = {}) => {
    const playlistUrls = {};
    for (const rendition of ladder.renditions) {
        const renditionFolder = `${folder}/${rendition.name}`;
        const segmentUrls = {};
        await mapLimit(rendition.segmentPaths, concurrency, async (segmentPath) => {
            segmentUrls[path.basename(segmentPath)] = await uploadFile(segmentPath, { resourceType: "video", folder: renditionFolder });
        });
        const playlist = rewritePlaylist(await fs.promises.readFile(rendition.playlistPath, "utf8"), (uri) => segmentUrls[uri]);
        await fs.promises.writeFile(rendition.playlistPath, playlist);
        playlistUrls[`${rendition.name}/index.m3u8`] = await uploadFile(rendition.playlistPath, { resourceType: "raw", folder: renditionFolder });
    }
    const master = rewritePlaylist(await fs.promises.readFile(ladder.masterPath, "utf8"), (uri) => playlistUrls[uri]);
    await fs.promises.writeFile(ladder.masterPath, master);
    return uploadFile(ladder.masterPath, { resourceType: "raw", folder });
};
