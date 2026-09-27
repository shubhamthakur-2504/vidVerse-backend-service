import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Video } = await import("../src/models/video.model.js");
const { Like } = await import("../src/models/like.model.js");
const { Comment } = await import("../src/models/comment.model.js");
const { Subscription } = await import("../src/models/subscription.model.js");
const agenda = (await import("../src/db/agendaSetup.js")).default;

describe("creator studio", () => {
    beforeEach(() => vi.spyOn(agenda, "schedule").mockResolvedValue(undefined));

    it("returns totals and every own video in any state with its counts", async () => {
        const me = await createUser();
        const fan = await createUser();
        const ready = await createVideo(me, { views: 40, createdAt: new Date(Date.now() - 60_000) });
        await createVideo(me, { status: "processing", thumbnailUrl: undefined, views: 0 });
        await createVideo(me, { isPublished: false, views: 2 });
        await createVideo(fan); // someone else's video is not listed
        await Like.create({ userId: fan._id, targetId: ready._id, targetType: "Video" });
        await Comment.create({ content: "nice", videoId: ready._id, userId: fan._id });
        await Subscription.create({ subscriber: fan._id, channel: me._id });

        const res = await request(app).get("/api/v2/me/studio").set(authHeader(me));
        expect(res.status).toBe(200);
        expect(res.body.data.totals).toEqual({ videos: 3, views: 42, likes: 1, comments: 1, subscribers: 1 });
        expect(res.body.data.processing).toBe(1);
        expect(res.body.data.videos.map((v) => v.status).sort()).toEqual(["processing", "ready", "ready"]);
        const readyRow = res.body.data.videos.find((v) => v._id === String(ready._id));
        expect(readyRow).toMatchObject({ likes: 1, comments: 1, views: 40, isPublished: true });
        expect(res.body.data.videos[res.body.data.videos.length - 1]._id).toBe(String(ready._id)); // newest first
    });

    it("shows your own video in any status, and nobody else's", async () => {
        const me = await createUser();
        const processing = await createVideo(me, { status: "processing" });
        expect((await request(app).get(`/api/v2/me/videos/${processing._id}`).set(authHeader(me))).body.data.status).toBe("processing");
        expect((await request(app).get(`/api/v2/me/videos/${processing._id}`).set(authHeader(await createUser()))).status).toBe(404);
    });

    it("reprocesses only failed videos and only for the owner", async () => {
        const me = await createUser();
        const failed = await createVideo(me, { status: "failed" });
        const ready = await createVideo(me);

        expect((await request(app).post(`/api/v2/videos/${failed._id}/reprocess`).set(authHeader(await createUser()))).status).toBe(404);
        const res = await request(app).post(`/api/v2/videos/${failed._id}/reprocess`).set(authHeader(me));
        expect(res.status).toBe(202);
        expect((await Video.findById(failed._id)).status).toBe("processing");
        expect(agenda.schedule).toHaveBeenCalledWith("in 5 seconds", "process video chunks", { videoId: failed._id, attempt: 1 });
        expect((await request(app).post(`/api/v2/videos/${ready._id}/reprocess`).set(authHeader(me))).status).toBe(409);
    });

    it("lists every allowed category for upload forms", async () => {
        const all = await request(app).get("/api/v2/videos/categories?all=true");
        expect(all.body.data).toContain("Gaming");
        expect(all.body.data.length).toBe(18);
        expect((await request(app).get("/api/v2/videos/categories")).body.data).toEqual([]); // no videos yet
    });
});
