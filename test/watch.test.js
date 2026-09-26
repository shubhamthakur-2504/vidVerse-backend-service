import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Like } = await import("../src/models/like.model.js");
const { Comment } = await import("../src/models/comment.model.js");
const { Subscription } = await import("../src/models/subscription.model.js");

const like = (userId, targetId, targetType, isLike = true) => Like.create({ userId, targetId, targetType, isLike });

describe("v2 watch payload", () => {
    it("returns the video with counts and the viewer's own state in one response", async () => {
        const owner = await createUser({ userName: "maker" });
        const [fan, other, third] = [await createUser(), await createUser(), await createUser()];
        const video = await createVideo(owner, { title: "Watch me" });
        await like(fan._id, video._id, "Video");
        await like(other._id, video._id, "Video");
        await like(third._id, video._id, "Video", false);
        await Comment.create({ content: "hi", videoId: video._id, userId: fan._id });
        await Subscription.create({ subscriber: fan._id, channel: owner._id });

        const asFan = await request(app).get(`/api/v2/videos/${video._id}`).set(authHeader(fan));
        expect(asFan.status).toBe(200);
        expect(asFan.body.data).toMatchObject({
            title: "Watch me",
            owner: { userName: "maker", subscribersCount: 1 },
            stats: { likes: 2, dislikes: 1, comments: 1 },
            viewer: { reaction: "like", isSubscribed: true, isOwner: false },
        });

        const anonymous = await request(app).get(`/api/v2/videos/${video._id}`);
        expect(anonymous.body.data.viewer).toEqual({ reaction: null, isSubscribed: false, isOwner: false });
        expect((await request(app).get(`/api/v2/videos/${video._id}`).set(authHeader(third))).body.data.viewer.reaction).toBe("dislike");
        expect((await request(app).get(`/api/v2/videos/${video._id}`).set(authHeader(owner))).body.data.viewer.isOwner).toBe(true);
    });

    it("lets only the owner open an unpublished video, and nobody a processing one", async () => {
        const owner = await createUser();
        const hidden = await createVideo(owner, { isPublished: false });
        const processing = await createVideo(owner, { status: "processing" });

        expect((await request(app).get(`/api/v2/videos/${hidden._id}`)).status).toBe(404);
        expect((await request(app).get(`/api/v2/videos/${hidden._id}`).set(authHeader(await createUser()))).status).toBe(404);
        expect((await request(app).get(`/api/v2/videos/${hidden._id}`).set(authHeader(owner))).status).toBe(200);
        expect((await request(app).get(`/api/v2/videos/${processing._id}`).set(authHeader(owner))).status).toBe(404);
    });
});

describe("v2 comments with reaction counts", () => {
    it("returns like/dislike counts and the viewer's reaction for every comment", async () => {
        const owner = await createUser();
        const [a, b] = [await createUser({ userName: "alpha" }), await createUser()];
        const video = await createVideo(owner);
        const c1 = await Comment.create({ content: "one", videoId: video._id, userId: a._id, createdAt: new Date(Date.now() - 60_000) });
        await Comment.create({ content: "two", videoId: video._id, userId: b._id });
        await like(a._id, c1._id, "Comment");
        await like(b._id, c1._id, "Comment", false);

        const res = await request(app).get(`/api/v2/videos/${video._id}/comments`).set(authHeader(a));
        expect(res.status).toBe(200);
        const byContent = Object.fromEntries(res.body.data.items.map((c) => [c.content, c]));
        expect(byContent.one).toMatchObject({ likeCount: 1, dislikeCount: 1, viewerReaction: "like", author: { userName: "alpha" } });
        expect(byContent.two).toMatchObject({ likeCount: 0, dislikeCount: 0, viewerReaction: null });
        expect(res.body.data.items.map((c) => c.content)).toEqual(["two", "one"]); // newest first

        const anonymous = await request(app).get(`/api/v2/videos/${video._id}/comments`);
        expect(anonymous.body.data.items.every((c) => c.viewerReaction === null)).toBe(true);
    });
});

describe("v2 related videos", () => {
    it("prefers the same category or creator by views, then fills with the newest", async () => {
        const creator = await createUser();
        const other = await createUser();
        const current = await createVideo(creator, { category: "Music" });
        const sameCategoryPopular = await createVideo(other, { category: "Music", views: 500 });
        const sameCreator = await createVideo(creator, { category: "Gaming", views: 10 });
        const unrelated = await createVideo(other, { category: "News", views: 9000 });
        await createVideo(other, { category: "Music", isPublished: false });

        const res = await request(app).get(`/api/v2/videos/${current._id}/related?limit=3`);
        expect(res.status).toBe(200);
        expect(res.body.data.map((v) => v._id)).toEqual([String(sameCategoryPopular._id), String(sameCreator._id), String(unrelated._id)]);
        expect(res.body.data.every((v) => v._id !== String(current._id))).toBe(true);
        expect(res.body.data[0].owner.userName).toBe(other.userName);
    });
});
