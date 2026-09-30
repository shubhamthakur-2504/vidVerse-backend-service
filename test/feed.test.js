import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");

const api = (method, path) => request(app)[method](`/api/v2${path}`);
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

describe("v2: subscriptions feed", () => {
    it("pages through public videos from followed channels only, newest first", async () => {
        const fan = await createUser();
        const [followed, alsoFollowed, stranger] = [await createUser(), await createUser(), await createUser()];
        const oldest = await createVideo(followed, { createdAt: minutesAgo(30) });
        const middle = await createVideo(alsoFollowed, { createdAt: minutesAgo(20) });
        const newest = await createVideo(followed, { createdAt: minutesAgo(10) });
        await createVideo(followed, { isPublished: false });
        await createVideo(alsoFollowed, { status: "processing" });
        await createVideo(stranger);

        expect((await api("get", "/me/subscriptions/videos").set(authHeader(fan))).body.data).toEqual({
            items: [],
            nextCursor: null,
        });

        await api("put", `/channels/${followed._id}/subscription`).set(authHeader(fan));
        await api("put", `/channels/${alsoFollowed._id}/subscription`).set(authHeader(fan));

        const first = await api("get", "/me/subscriptions/videos?limit=2").set(authHeader(fan));
        expect(first.status).toBe(200);
        expect(first.body.data.items.map((v) => v._id)).toEqual([String(newest._id), String(middle._id)]);
        expect(first.body.data.items[1].owner).toMatchObject({ userName: alsoFollowed.userName });
        expect(first.body.data.nextCursor).toBeTruthy();

        const second = await api("get", `/me/subscriptions/videos?limit=2&cursor=${first.body.data.nextCursor}`).set(
            authHeader(fan)
        );
        expect(second.body.data).toMatchObject({ items: [{ _id: String(oldest._id) }], nextCursor: null });

        expect((await api("get", "/me/subscriptions/videos")).status).toBe(401);
        expect((await api("get", "/me/subscriptions/videos?limit=500").set(authHeader(fan))).status).toBe(400);
    });
});
