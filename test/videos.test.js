import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Video } = await import("../src/models/video.model.js");
const { Comment } = await import("../src/models/comment.model.js");
const { Like } = await import("../src/models/like.model.js");
const { View } = await import("../src/models/view.model.js");
const { PlayList } = await import("../src/models/playList.model.js");
const { User } = await import("../src/models/user.model.js");

describe("video feed", () => {
    it("lists only published, ready videos", async () => {
        const owner = await createUser();
        const visible = await createVideo(owner);
        await createVideo(owner, { status: "processing" });
        await createVideo(owner, { status: "failed" });
        await createVideo(owner, { isPublished: false });

        const res = await request(app).get("/api/v1/videos/getallvideos");
        expect(res.status).toBe(200);
        expect(res.body.data.items.map((v) => v._id)).toEqual([String(visible._id)]);
        expect(res.body.data.nextCursor).toBeNull();
    });
});

describe("feed search (S7)", () => {
    it("matches the search text literally", async () => {
        const owner = await createUser();
        await createVideo(owner, { title: "a.b explained" });
        await createVideo(owner, { title: "axb explained" });

        const dot = await request(app).get("/api/v1/videos/getallvideos").query({ query: "a.b" });
        expect(dot.status).toBe(200);
        expect(dot.body.data.items.map((v) => v.title)).toEqual(["a.b explained"]);

        // an unbalanced "(" used to be an invalid regex and a 500
        const paren = await request(app).get("/api/v1/videos/getallvideos").query({ query: "(" });
        expect(paren.status).toBe(200);
        expect(paren.body.data.items).toEqual([]);
    });
});

describe("views and watch history (C6, H5)", () => {
    it("records a view for an anonymous viewer without touching any history", async () => {
        const video = await createVideo(await createUser());
        const res = await request(app).post(`/api/v1/videos/${video._id}/view`);
        expect(res.status).toBe(204);
        expect(await View.countDocuments({ targetId: video._id })).toBe(1);
    });

    it("counts a logged-in viewer once per window and keeps history most-recent-first without duplicates", async () => {
        const viewer = await createUser();
        const owner = await createUser();
        const [a, b] = [await createVideo(owner), await createVideo(owner)];

        for (const video of [a, b, a]) {
            const res = await request(app).post(`/api/v1/videos/${video._id}/view`).set(authHeader(viewer));
            expect(res.status).toBe(204);
        }
        expect(await View.countDocuments({ targetId: a._id })).toBe(1);

        const history = await request(app).get("/api/v1/user/getwatchhistory").set(authHeader(viewer));
        expect(history.status).toBe(200);
        expect(history.body.data.map((v) => v._id)).toEqual([String(a._id), String(b._id)]);
    });

    it("does not record the details fetch as a view", async () => {
        const video = await createVideo(await createUser());
        const res = await request(app).get(`/api/v1/videos/getvideodetails/${video._id}`);
        expect(res.status).toBe(200);
        expect(await View.countDocuments({})).toBe(0);
    });
});

describe("video deletion (H9)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("removes the video, everything that references it, and its media folder", async () => {
        const owner = await createUser();
        const fan = await createUser();
        const video = await createVideo(owner);
        const other = await createVideo(owner);
        const comment = await Comment.create({ content: "hi", videoId: video._id, userId: fan._id });
        await Like.create({ userId: fan._id, targetId: video._id, targetType: "Video" });
        await Like.create({ userId: fan._id, targetId: comment._id, targetType: "Comment" });
        await View.create({ targetId: video._id, targetType: "Video", viewerHash: "h" });
        await PlayList.create({ title: "p", thumbnailUrl: "t", videos: [video._id, other._id], ownerId: fan._id });
        await User.updateOne({ _id: fan._id }, { $set: { watchHistory: [video._id, other._id] } });

        const res = await request(app).delete(`/api/v1/videos/delete/${video._id}`).set(authHeader(owner));
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ _id: String(video._id) });

        expect(await Video.findById(video._id)).toBeNull();
        expect(await Comment.countDocuments({ videoId: video._id })).toBe(0);
        expect(await Like.countDocuments({})).toBe(0);
        expect(await View.countDocuments({ targetId: video._id })).toBe(0);
        expect((await PlayList.findOne({})).videos.map(String)).toEqual([String(other._id)]);
        expect((await User.findById(fan._id)).watchHistory.map(String)).toEqual([String(other._id)]);
        expect(cloudinaryMock.deleteCloudinaryFolder).toHaveBeenCalledWith(`videos/${video._id}`);
    });
});
