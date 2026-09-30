import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Notification } = await import("../src/models/notification.model.js");
const { Subscription } = await import("../src/models/subscription.model.js");
const { notifyNewVideo } = await import("../src/services/notification.service.js");

const api = (method, path) => request(app)[method](`/api/v2${path}`);
const unread = async (user) => (await api("get", "/me/notifications/unread-count").set(authHeader(user))).body.data.count;

describe("v2: notifications", () => {
    it("notifies a channel once per new subscriber", async () => {
        const channel = await createUser();
        const fan = await createUser({ userName: "newfan" });
        await api("put", `/channels/${channel._id}/subscription`).set(authHeader(fan));
        await api("put", `/channels/${channel._id}/subscription`).set(authHeader(fan));

        expect(await unread(channel)).toBe(1);
        const list = (await api("get", "/me/notifications").set(authHeader(channel))).body.data;
        expect(list.items).toHaveLength(1);
        expect(list.items[0]).toMatchObject({ type: "subscribe", actor: { userName: "newfan" }, video: null, post: null, readAt: null });
        expect(list.items[0].recipient).toBeUndefined();
    });

    it("notifies the owner about comments by others on videos and posts, with previews", async () => {
        const owner = await createUser();
        const viewer = await createUser({ userName: "commenter" });
        const video = await createVideo(owner, { title: "My great video" });
        const post = (await api("post", "/posts").set(authHeader(owner)).field("content", "Big news today")).body.data;

        await api("post", `/videos/${video._id}/comments`).set(authHeader(viewer)).send({ content: "Loved it" });
        await api("post", `/posts/${post._id}/comments`).set(authHeader(viewer)).send({ content: "Congrats" });
        await api("post", `/videos/${video._id}/comments`).set(authHeader(owner)).send({ content: "thanks all" });

        const items = (await api("get", "/me/notifications").set(authHeader(owner))).body.data.items;
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ type: "comment", actor: { userName: "commenter" }, post: { content: "Big news today" }, comment: { content: "Congrats" }, video: null });
        expect(items[1]).toMatchObject({ type: "comment", video: { title: "My great video" }, comment: { content: "Loved it" }, post: null });
        expect(await unread(viewer)).toBe(0);
    });

    it("marks chosen or all notifications read, only for their recipient", async () => {
        const channel = await createUser();
        const other = await createUser();
        for (const fan of [await createUser(), await createUser(), await createUser()]) {
            await api("put", `/channels/${channel._id}/subscription`).set(authHeader(fan));
        }
        const [first] = (await api("get", "/me/notifications").set(authHeader(channel))).body.data.items;

        // someone else's ids change nothing
        expect((await api("post", "/me/notifications/read").set(authHeader(other)).send({ ids: [first._id] })).body.data.updated).toBe(0);
        expect((await api("post", "/me/notifications/read").set(authHeader(channel)).send({ ids: [first._id] })).body.data.updated).toBe(1);
        expect(await unread(channel)).toBe(2);
        expect((await api("post", "/me/notifications/read").set(authHeader(channel)).send({})).body.data.updated).toBe(2);
        expect(await unread(channel)).toBe(0);

        expect((await api("post", "/me/notifications/read").set(authHeader(channel)).send({ ids: ["nope"] })).status).toBe(400);
        expect((await api("get", "/me/notifications")).status).toBe(401);
    });

    it("pages newest first", async () => {
        const channel = await createUser();
        for (let i = 0; i < 3; i++) await api("put", `/channels/${channel._id}/subscription`).set(authHeader(await createUser()));
        const first = (await api("get", "/me/notifications?limit=2").set(authHeader(channel))).body.data;
        expect(first.items).toHaveLength(2);
        const second = (await api("get", `/me/notifications?limit=2&cursor=${first.nextCursor}`).set(authHeader(channel))).body.data;
        expect(second).toMatchObject({ nextCursor: null });
        expect(second.items).toHaveLength(1);
    });

    it("tells every subscriber about a new video", async () => {
        const channel = await createUser();
        const fans = [await createUser(), await createUser()];
        await Subscription.insertMany(fans.map((fan) => ({ subscriber: fan._id, channel: channel._id })));
        const video = await createVideo(channel);
        await notifyNewVideo(video);
        const recipients = await Notification.find({ type: "video", video: video._id }).distinct("recipient");
        expect(recipients.map(String).sort()).toEqual(fans.map((f) => String(f._id)).sort());
    });

    it("removes notifications about a deleted comment or video", async () => {
        const owner = await createUser();
        const viewer = await createUser();
        const video = await createVideo(owner);
        const comment = (await api("post", `/videos/${video._id}/comments`).set(authHeader(viewer)).send({ content: "hi" })).body.data;
        await api("post", `/videos/${video._id}/comments`).set(authHeader(viewer)).send({ content: "again" });
        expect(await Notification.countDocuments({ video: video._id })).toBe(2);

        await api("delete", `/comments/${comment._id}`).set(authHeader(viewer));
        expect(await Notification.countDocuments({ video: video._id })).toBe(1);
        await api("delete", `/videos/${video._id}`).set(authHeader(owner));
        expect(await Notification.countDocuments({ video: video._id })).toBe(0);
    });
});
