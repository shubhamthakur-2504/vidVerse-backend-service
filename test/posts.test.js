import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Tweet } = await import("../src/models/tweet.model.js");

const api = (method, path) => request(app)[method](`/api/v2${path}`);

describe("v2: community posts", () => {
    it("lists posts with the author, counts and the viewer's own state", async () => {
        const author = await createUser({ userName: "poster" });
        const fan = await createUser();
        const first = (await api("post", "/posts").set(authHeader(author)).field("content", "first post")).body.data;
        const second = (await api("post", "/posts").set(authHeader(author)).field("content", "second post")).body.data;
        await api("post", "/posts").set(authHeader(fan)).field("content", "fan post");

        await api("put", `/reactions/post/${first._id}`).set(authHeader(fan)).send({ value: "like" });
        await api("post", `/posts/${first._id}/comments`).set(authHeader(fan)).send({ content: "nice" });

        const feed = (await api("get", "/posts").set(authHeader(fan))).body.data;
        expect(feed.items.map((p) => p.content)).toEqual(["fan post", "second post", "first post"]);
        expect(feed.items[2]).toMatchObject({
            owner: { userName: "poster" }, likeCount: 1, dislikeCount: 0, commentCount: 1,
            viewerReaction: "like", isOwner: false, canEdit: false, isEdited: false,
        });
        expect(feed.items[0]).toMatchObject({ isOwner: true, canEdit: true, viewerReaction: null });

        // anonymous viewers get the same counts and no personal state
        expect((await api("get", "/posts")).body.data.items[2]).toMatchObject({ likeCount: 1, viewerReaction: null, isOwner: false });

        const channel = await api("get", "/channels/Poster/posts?limit=1").set(authHeader(author));
        expect(channel.status).toBe(200);
        expect(channel.body.data.items.map((p) => p._id)).toEqual([second._id]);
        const next = await api("get", `/channels/poster/posts?limit=1&cursor=${channel.body.data.nextCursor}`);
        expect(next.body.data).toMatchObject({ items: [{ _id: first._id }], nextCursor: null });
        expect((await api("get", "/channels/nobody-here/posts")).status).toBe(404);

        const one = await api("get", `/posts/${first._id}`).set(authHeader(author));
        expect(one.body.data).toMatchObject({ content: "first post", isOwner: true, commentCount: 1 });
        expect((await api("get", `/posts/${author._id}`)).status).toBe(404);
    });

    it("closes the edit window after 15 minutes", async () => {
        const author = await createUser();
        const old = await Tweet.create({ content: "old", owner: author._id, createdAt: new Date(Date.now() - 20 * 60_000) });
        expect((await api("get", `/posts/${old._id}`).set(authHeader(author))).body.data).toMatchObject({ isOwner: true, canEdit: false });
        expect((await api("patch", `/posts/${old._id}`).set(authHeader(author)).send({ content: "late edit" })).status).toBe(400);
    });
});
