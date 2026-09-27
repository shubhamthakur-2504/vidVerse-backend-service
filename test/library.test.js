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
        expect((await api("get", "/me/history").set(authHeader(viewer))).body.data.map((v) => v._id)).toEqual([String(b._id)]);

        expect((await api("delete", "/me/history").set(authHeader(viewer))).status).toBe(204);
        expect((await api("get", "/me/history").set(authHeader(viewer))).body.data).toEqual([]);
        expect((await User.findById(other._id)).watchHistory.map(String)).toEqual([String(a._id)]);

        expect((await api("delete", "/me/history/not-an-id").set(authHeader(viewer))).status).toBe(400);
        expect((await api("delete", "/me/history")).status).toBe(401);
    });
});
