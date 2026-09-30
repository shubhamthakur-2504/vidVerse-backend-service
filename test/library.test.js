import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { User } = await import("../src/models/user.model.js");

const api = (method, path) => request(app)[method](`/api/v2${path}`);

describe("v2 library: watch history", () => {
    it("removes one video, then clears the rest, only for the signed-in user", async () => {
        const viewer = await createUser();
        const other = await createUser();
        const [a, b] = [await createVideo(other), await createVideo(other)];
        await User.updateOne({ _id: viewer._id }, { $set: { watchHistory: [a._id, b._id] } });
        await User.updateOne({ _id: other._id }, { $set: { watchHistory: [a._id] } });

        expect((await api("delete", `/me/history/${a._id}`).set(authHeader(viewer))).status).toBe(204);
        expect((await api("get", "/me/history").set(authHeader(viewer))).body.data.map((v) => v._id)).toEqual([
            String(b._id),
        ]);

        expect((await api("delete", "/me/history").set(authHeader(viewer))).status).toBe(204);
        expect((await api("get", "/me/history").set(authHeader(viewer))).body.data).toEqual([]);
        expect((await User.findById(other._id)).watchHistory.map(String)).toEqual([String(a._id)]);

        expect((await api("delete", "/me/history/not-an-id").set(authHeader(viewer))).status).toBe(400);
        expect((await api("delete", "/me/history")).status).toBe(401);
    });
});

describe("v2 library: playlists", () => {
    it("lists my playlists with counts, and marks the ones holding a given video", async () => {
        const user = await createUser();
        const [a, b] = [await createVideo(user), await createVideo(user)];
        const first = (
            await api("post", "/playlists")
                .set(authHeader(user))
                .send({ videoId: String(a._id), title: "Has A" })
        ).body.data;
        await api("put", `/playlists/${first._id}/videos/${b._id}`).set(authHeader(user));
        await api("post", "/playlists")
            .set(authHeader(user))
            .send({ videoId: String(b._id), title: "Only B" });

        const plain = (await api("get", "/playlists").set(authHeader(user))).body.data;
        expect(plain.map((p) => [p.title, p.videoCount])).toEqual([
            ["Only B", 1],
            ["Has A", 2],
        ]);
        expect(plain[0].hasVideo).toBeUndefined();

        const marked = (await api("get", `/playlists?videoId=${a._id}`).set(authHeader(user))).body.data;
        expect(marked.map((p) => [p.title, p.hasVideo])).toEqual([
            ["Only B", false],
            ["Has A", true],
        ]);
        expect((await api("get", "/playlists?videoId=nope").set(authHeader(user))).status).toBe(400);
    });

    it("serves a public playlist page in playlist order, hiding videos the viewer may not see", async () => {
        const owner = await createUser();
        const other = await createUser();
        const mine = await createVideo(owner, { isPublished: false });
        const [first, second] = [await createVideo(other), await createVideo(other)];
        const hidden = await createVideo(other, { isPublished: false });
        const processing = await createVideo(other, { status: "processing" });

        const created = (
            await api("post", "/playlists")
                .set(authHeader(owner))
                .send({ videoId: String(second._id), title: "Mix" })
        ).body.data;
        for (const video of [first, hidden, processing, mine]) {
            await api("put", `/playlists/${created._id}/videos/${video._id}`).set(authHeader(owner));
        }

        const anonymous = await api("get", `/playlists/${created._id}`);
        expect(anonymous.status).toBe(200);
        expect(anonymous.body.data).toMatchObject({
            title: "Mix",
            isOwner: false,
            owner: { userName: owner.userName },
        });
        expect(anonymous.body.data.videos.map((v) => v._id)).toEqual([String(second._id), String(first._id)]);
        expect(anonymous.body.data.videos[0].owner.userName).toBe(other.userName);

        const asOwner = (await api("get", `/playlists/${created._id}`).set(authHeader(owner))).body.data;
        expect(asOwner.isOwner).toBe(true);
        expect(asOwner.videos.map((v) => v._id)).toEqual([String(second._id), String(first._id), String(mine._id)]);

        expect((await api("get", `/playlists/${other._id}`)).status).toBe(404);
        expect((await api("get", "/playlists")).status).toBe(401);
    });
});
