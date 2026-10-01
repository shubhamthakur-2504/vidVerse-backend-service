import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { PlayList } = await import("../src/models/playList.model.js");

const api = (method, path) => request(app)[method](`/api/v2${path}`);
const cookieOf = (res, name) => res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
const png = Buffer.from("fake-png");

describe("v2: versioning", () => {
    it("marks v1 responses deprecated and points to v2", async () => {
        const v1 = await request(app).get("/api/v1/healthcheck");
        expect(v1.headers.deprecation).toBe("true");
        expect(v1.headers.link).toBe('</api/v2>; rel="successor-version"');
        const v2 = await api("get", "/health");
        expect(v2.status).toBe(200);
        expect(v2.headers.deprecation).toBeUndefined();
    });
});

describe("v2: auth and sessions", () => {
    it("registers, logs in on two devices, lists and revokes sessions", async () => {
        const reg = await api("post", "/auth/register")
            .field("userName", "vtwo")
            .field("email", "vtwo@example.com")
            .field("fullName", "V Two")
            .field("password", "password123")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" })
            .attach("cover", png, { filename: "c.png", contentType: "image/png" });
        expect(reg.status).toBe(201);

        const laptop = await api("post", "/auth/login")
            .set("User-Agent", "laptop")
            .send({ identifier: "vtwo", password: "password123" });
        const phone = await api("post", "/auth/login")
            .set("User-Agent", "phone")
            .send({ identifier: "vtwo", password: "password123" });
        const laptopAuth = cookieOf(laptop, "accessToken");

        const sessions = await api("get", "/auth/sessions").set("Cookie", laptopAuth);
        expect(sessions.status).toBe(200);
        expect(sessions.body.data.map((s) => [s.userAgent, s.current]).sort()).toEqual([
            ["laptop", true],
            ["phone", false],
        ]);

        const refreshed = await api("post", "/auth/refresh").set("Cookie", cookieOf(phone, "refreshToken"));
        expect(refreshed.status).toBe(200);

        const others = await api("delete", "/auth/sessions/others").set("Cookie", laptopAuth);
        expect(others.body.data.revoked).toBe(1);
        expect((await api("get", "/me").set("Cookie", cookieOf(refreshed, "accessToken"))).status).toBe(401);

        const [current] = (await api("get", "/auth/sessions").set("Cookie", laptopAuth)).body.data;
        expect((await api("delete", `/auth/sessions/${current._id}`).set("Cookie", laptopAuth)).status).toBe(200);
        expect((await api("get", "/me").set("Cookie", laptopAuth)).status).toBe(401);
    });

    it("cannot revoke another user's session", async () => {
        const alice = await createUser();
        const bob = await createUser();
        const bobLogin = await api("post", "/auth/login").send({ identifier: bob.userName, password: "password123" });
        const [bobSession] = (await api("get", "/auth/sessions").set("Cookie", cookieOf(bobLogin, "accessToken"))).body
            .data;
        const res = await api("delete", `/auth/sessions/${bobSession._id}`).set(authHeader(alice));
        expect(res.status).toBe(404);
    });
});

describe("v2: me, channels and subscriptions", () => {
    it("serves the profile, channel page and idempotent subscriptions", async () => {
        const creator = await createUser({ userName: "creator" });
        const fan = await createUser();
        await createVideo(creator);
        await createVideo(creator, { isPublished: false });

        expect((await api("get", "/me").set(authHeader(fan))).body.data.userName).toBe(fan.userName);
        expect((await api("patch", "/me").set(authHeader(fan)).send({ fullName: "New Name" })).status).toBe(200);

        const first = await api("put", `/channels/${creator._id}/subscription`).set(authHeader(fan));
        const again = await api("put", `/channels/${creator._id}/subscription`).set(authHeader(fan));
        expect([first.status, again.status]).toEqual([201, 200]);
        expect((await api("put", `/channels/${fan._id}/subscription`).set(authHeader(fan))).status).toBe(400);

        const channel = await api("get", "/channels/Creator").set(authHeader(fan));
        expect(channel.status).toBe(200);
        expect(channel.body.data).toMatchObject({
            userName: "creator",
            subscribersCount: 1,
            videosCount: 1,
            isSubscribed: true,
            isOwner: false,
        });
        expect((await api("get", "/channels/creator")).body.data.isSubscribed).toBe(false);

        const videos = await api("get", "/channels/creator/videos");
        expect(videos.body.data.items).toHaveLength(1);
        expect(videos.body.data.items[0].owner.userName).toBe("creator");

        expect((await api("get", "/me/subscriptions").set(authHeader(fan))).body.data.items[0].channel.userName).toBe(
            "creator"
        );
        expect((await api("get", "/me/stats").set(authHeader(creator))).body.data.subscribersCount).toBe(1);
        expect((await api("delete", `/channels/${creator._id}/subscription`).set(authHeader(fan))).status).toBe(204);

        // public playlists with their video counts
        await PlayList.create({
            title: "Best of",
            thumbnailUrl: "t",
            videos: [(await createVideo(creator))._id],
            ownerId: creator._id,
        });
        const lists = await api("get", "/channels/creator/playlists");
        expect(lists.status).toBe(200);
        expect(lists.body.data).toMatchObject([{ title: "Best of", videoCount: 1 }]);
        expect((await api("get", "/channels/nobody-here/playlists")).status).toBe(404);
        expect((await api("get", "/channels/nobody-here")).status).toBe(404);
    });
});

describe("v2: videos, comments and reactions", () => {
    it("updates visibility through PATCH and deletes", async () => {
        const owner = await createUser();
        const video = await createVideo(owner);

        // the feed card names the channel, so the list carries the owner's display name
        const listed = (await api("get", "/videos")).body.data.items[0];
        expect(listed.owner).toMatchObject({
            userName: owner.userName,
            fullName: owner.fullName,
        });

        const hide = await api("patch", `/videos/${video._id}`).set(authHeader(owner)).send({ isPublished: false });
        expect(hide.status).toBe(200);
        expect(hide.body.data.isPublished).toBe(false);
        expect((await api("get", "/videos")).body.data.items).toHaveLength(0);
        expect((await api("get", "/me/videos").set(authHeader(owner))).body.data).toHaveLength(1);

        expect((await api("delete", `/videos/${video._id}`).set(authHeader(owner))).status).toBe(200);
    });

    it("handles comments: author edits, content owner or author deletes, strangers cannot", async () => {
        const owner = await createUser();
        const author = await createUser();
        const stranger = await createUser();
        const video = await createVideo(owner);

        const created = await api("post", `/videos/${video._id}/comments`)
            .set(authHeader(author))
            .send({ content: "first!" });
        expect(created.status).toBe(200);
        const commentId = created.body.data._id;

        expect((await api("get", `/videos/${video._id}/comments`)).body.data.items).toHaveLength(1);
        expect(
            (await api("patch", `/comments/${commentId}`).set(authHeader(author)).send({ content: "edited" })).status
        ).toBe(200);
        expect((await api("delete", `/comments/${commentId}`).set(authHeader(stranger))).status).toBe(403);
        expect((await api("delete", `/comments/${commentId}`).set(authHeader(owner))).status).toBe(200);
        expect((await api("get", `/videos/${video._id}/comments`)).body.data.items).toHaveLength(0);
    });

    it("sets, reads, counts and removes reactions by target type", async () => {
        const user = await createUser();
        const video = await createVideo(user);
        const path = `/reactions/video/${video._id}`;

        expect((await api("put", path).set(authHeader(user)).send({ value: "like" })).status).toBe(201);
        expect((await api("get", path).set(authHeader(user))).body.data.status).toBe("like");
        expect((await api("get", `${path}/count`)).body.data.likes).toBe(1);
        await api("put", path).set(authHeader(user)).send({ value: "dislike" });
        expect((await api("get", path).set(authHeader(user))).body.data.status).toBe("dislike");
        expect((await api("delete", path).set(authHeader(user))).status).toBe(204);

        expect(
            (await api("put", `/reactions/tweet/${video._id}`).set(authHeader(user)).send({ value: "like" })).status
        ).toBe(400);
        expect((await api("put", path).set(authHeader(user)).send({ value: "love" })).status).toBe(400);
    });
});

describe("v2: posts and playlists", () => {
    it("runs the post lifecycle with comments", async () => {
        const user = await createUser();
        const created = await api("post", "/posts").set(authHeader(user)).field("content", "hello world");
        expect(created.status).toBe(200);
        const id = created.body.data._id;

        expect((await api("get", "/posts")).body.data.items).toHaveLength(1);
        expect((await api("get", `/posts/${id}`)).body.data.content).toBe("hello world");
        expect((await api("patch", `/posts/${id}`).set(authHeader(user)).send({ content: "edited" })).status).toBe(200);
        expect(
            (await api("post", `/posts/${id}/comments`).set(authHeader(user)).send({ content: "nice" })).status
        ).toBe(200);
        expect((await api("get", `/posts/${id}/comments`)).body.data.items).toHaveLength(1);
        expect((await api("delete", `/posts/${id}`).set(authHeader(user))).status).toBe(200);
    });

    it("manages playlists with nested video routes", async () => {
        const user = await createUser();
        const [a, b] = [await createVideo(user), await createVideo(user)];

        expect((await api("get", "/playlists").set(authHeader(user))).body.data).toEqual([]);
        const created = await api("post", "/playlists")
            .set(authHeader(user))
            .send({ videoId: String(a._id), title: "Favourites" });
        expect(created.status).toBe(200);
        const id = created.body.data._id;

        expect(
            (await api("put", `/playlists/${id}/videos/${b._id}`).set(authHeader(user))).body.data.videos
        ).toHaveLength(2);
        expect(
            (await api("delete", `/playlists/${id}/videos/${a._id}`).set(authHeader(user))).body.data.videos
        ).toEqual([String(b._id)]);
        expect(
            (await api("patch", `/playlists/${id}`).set(authHeader(user)).send({ title: "Renamed" })).body.data.title
        ).toBe("Renamed");
        expect((await api("get", `/playlists/${id}`).set(authHeader(user))).body.data.title).toBe("Renamed");
        expect((await api("delete", `/playlists/${id}`).set(authHeader(user))).status).toBe(200);
    });
});
