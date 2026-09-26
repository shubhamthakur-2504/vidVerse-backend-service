import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Comment } = await import("../src/models/comment.model.js");
const { Tweet } = await import("../src/models/tweet.model.js");
const { Subscription } = await import("../src/models/subscription.model.js");

// follow nextCursor until the last page; returns the pages' item lists
const walk = async (url, pick = (item) => item._id, headers = {}) => {
    const pages = [];
    let cursor = null;
    do {
        const res = await request(app).get(url).set(headers).query(cursor ? { cursor } : {});
        expect(res.status).toBe(200);
        pages.push(res.body.data.items.map(pick));
        cursor = res.body.data.nextCursor;
    } while (cursor && pages.length < 20);
    return pages;
};

const minutesAgo = (n) => new Date(Date.now() - n * 60_000);

describe("cursor pagination", () => {
    it("walks the video feed newest first without gaps or repeats", async () => {
        const owner = await createUser();
        for (let i = 5; i >= 1; i--) await createVideo(owner, { title: `v${i}`, createdAt: minutesAgo(i) });

        const pages = await walk("/api/v1/videos/getallvideos?limit=2", (v) => v.title);
        expect(pages).toEqual([["v1", "v2"], ["v3", "v4"], ["v5"]]);
    });

    it("keeps items created in the same millisecond apart using _id", async () => {
        const owner = await createUser();
        const same = minutesAgo(1);
        for (let i = 0; i < 5; i++) await createVideo(owner, { createdAt: same });

        const pages = await walk("/api/v1/videos/getallvideos?limit=2");
        const ids = pages.flat();
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
    });

    it("pages video comments and tweets the same way", async () => {
        const user = await createUser();
        const video = await createVideo(user);
        for (let i = 3; i >= 1; i--) {
            await Comment.create({ content: `c${i}`, videoId: video._id, userId: user._id, createdAt: minutesAgo(i) });
            await Tweet.create({ content: `t${i}`, owner: user._id, createdAt: minutesAgo(i) });
        }
        expect(await walk(`/api/v1/videos/getallcomments/${video._id}?limit=2`, (c) => c.content)).toEqual([["c1", "c2"], ["c3"]]);
        expect(await walk("/api/v1/tweets/getalltweet?limit=2", (t) => t.content)).toEqual([["t1", "t2"], ["t3"]]);
    });

    it("pages my subscriptions with channel details", async () => {
        const me = await createUser();
        for (let i = 3; i >= 1; i--) {
            const channel = await createUser({ userName: `channel${i}` });
            await Subscription.create({ subscriber: me._id, channel: channel._id, createdAt: minutesAgo(i) });
        }
        const pages = await walk("/api/v1/subscription/mysubscriptions?limit=2", (s) => s.channel.userName, authHeader(me));
        expect(pages).toEqual([["channel1", "channel2"], ["channel3"]]);
    });

    it.each([
        ["a garbage cursor", "?cursor=not-a-cursor", "Invalid cursor"],
        ["a limit over 50", "?limit=51", "Validation failed"],
        ["a non-numeric limit", "?limit=ten", "Validation failed"],
    ])("rejects %s with 400", async (_label, qs, message) => {
        const res = await request(app).get(`/api/v1/videos/getallvideos${qs}`);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(message);
    });
});
