import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { Video } = await import("../src/models/video.model.js");
const { Subscription } = await import("../src/models/subscription.model.js");
const { Notification } = await import("../src/models/notification.model.js");
const agenda = (await import("../src/db/agendaSetup.js")).default;
await import("../src/utils/agendaJobs.js");
const processVideo = (agenda._definitions ?? agenda.definitions)["process video chunks"].fn;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "vv-job-"));
const clip = path.join(work, "source.mp4");
const tempEntries = () => fs.readdirSync("public/temps").filter((f) => f !== ".gitkeep");

describe("video processing job (adaptive HLS)", () => {
    beforeAll(() => {
        execFileSync(ffmpegPath, ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=8:size=1280x720:rate=25", "-f", "lavfi", "-i", "sine=duration=8", "-shortest", "-pix_fmt", "yuv420p", clip]);
    }, 60000);
    afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(agenda, "schedule").mockResolvedValue(undefined);
        cloudinaryMock.downloadFromCloudinary.mockImplementation(async (url, localPath) => fs.copyFileSync(clip, localPath));
    });

    it("publishes a 360p + 720p ladder, generates the thumbnail, stores the duration and deletes the original", async () => {
        const before = tempEntries();
        const owner = await createUser();
        const fan = await createUser();
        await Subscription.create({ subscriber: fan._id, channel: owner._id });
        const video = await Video.create({
            videoFileUrl: "https://res.cloudinary.com/test/video/upload/v1/uploads/u1/original.mp4",
            sourcePublicId: "uploads/u1/original",
            title: "Direct upload",
            owner: owner._id,
            status: "processing",
        });

        await processVideo({ attrs: { data: { videoId: String(video._id) } } });

        const saved = await Video.findById(video._id);
        expect(saved.status).toBe("ready");
        expect(saved.videoFileUrl).toBe(`https://res.cloudinary.com/test/raw/upload/v1/videos/${video._id}/master.m3u8`);
        expect(saved.thumbnailUrl).toMatch(/thumbnails\/up\d+\.png$/);
        expect(saved.duration).toBeCloseTo(8, 0);

        const folders = new Set(cloudinaryMock.uploadFileForHls.mock.calls.map(([, opts]) => opts.folder));
        expect(folders).toEqual(new Set([`videos/${video._id}`, `videos/${video._id}/360p`, `videos/${video._id}/720p`]));
        // the direct upload's public id is used as-is (it has more than two path segments)
        expect(cloudinaryMock.deleteFromCloudinary).toHaveBeenCalledWith("uploads/u1/original", "video");
        expect(tempEntries()).toEqual(before);
        // the finished public video is announced to the channel's subscribers
        expect(await Notification.find({ type: "video", video: video._id }).distinct("recipient")).toEqual([fan._id]);
    }, 180000);

    it("keeps an uploaded thumbnail and retries on failure without leaving files behind", async () => {
        const before = tempEntries();
        const owner = await createUser();
        const video = await Video.create({
            videoFileUrl: "https://res.cloudinary.com/test/video/upload/v1/videos/legacy.mp4",
            thumbnailUrl: "https://res.cloudinary.com/test/image/upload/v1/thumbnails/custom.jpg",
            title: "Legacy upload",
            duration: 8,
            owner: owner._id,
            status: "processing",
        });
        cloudinaryMock.uploadFileForHls.mockRejectedValueOnce(new Error("cloudinary down"));

        await processVideo({ attrs: { data: { videoId: String(video._id), attempt: 1 } } });

        const saved = await Video.findById(video._id);
        expect(saved.status).toBe("processing");
        expect(saved.thumbnailUrl).toMatch(/custom\.jpg$/);
        expect(agenda.schedule).toHaveBeenCalledWith("in 2 minutes", "process video chunks", { videoId: String(video._id), attempt: 2 });
        expect(cloudinaryMock.deleteCloudinaryFolder).toHaveBeenCalledWith(`videos/${video._id}`);
        expect(tempEntries()).toEqual(before);
    }, 180000);
});
