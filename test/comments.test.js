import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");

describe("video comments", () => {
    it("returns an empty list for a video without comments (H7)", async () => {
        const video = await createVideo(await createUser());
        const res = await request(app).get(`/api/v1/videos/getallcomments/${video._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ items: [], nextCursor: null });
    });

    it("creates a comment and lists it with the author", async () => {
        const author = await createUser({ userName: "commenter" });
        const video = await createVideo(await createUser());

        const created = await request(app).post(`/api/v1/videos/createcomment/${video._id}`).set(authHeader(author)).send({ content: "great video" });
        expect(created.status).toBe(200);

        const res = await request(app).get(`/api/v1/videos/getallcomments/${video._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0]).toMatchObject({ content: "great video", userDetails: { userName: "commenter" }, editStatus: false });
        expect(res.body.data.items[0].relativeTime).toBe("Today");
    });

    it("rejects an empty comment with 400", async () => {
        const video = await createVideo(await createUser());
        const res = await request(app).post(`/api/v1/videos/createcomment/${video._id}`).set(authHeader(await createUser())).send({ content: "   " });
        expect(res.status).toBe(400);
    });

    it("returns 404 when listing comments of a missing video", async () => {
        const res = await request(app).get("/api/v1/videos/getallcomments/507f1f77bcf86cd799439011");
        expect(res.status).toBe(404);
    });
});
