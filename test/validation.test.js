import fs from "fs";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Like } = await import("../src/models/like.model.js");

const png = Buffer.from("fake-png-bytes");
const tempFiles = () => fs.readdirSync("public/temps").filter((f) => f !== ".gitkeep");

describe("request validation", () => {
    it("reports every invalid registration field and removes the uploaded files", async () => {
        const before = tempFiles();
        const res = await request(app)
            .post("/api/v1/user/register")
            .field("userName", "no spaces allowed").field("email", "not-an-email").field("fullName", "  ").field("password", "short")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" })
            .attach("cover", png, { filename: "c.png", contentType: "image/png" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Validation failed");
        expect(res.body.errors.map((e) => e.field).sort()).toEqual(["email", "fullName", "password", "userName"]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(tempFiles()).toEqual(before);
    });

    it("requires a username or email to log in", async () => {
        const res = await request(app).post("/api/v1/user/login").send({ password: "x" });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([{ field: "identifier", message: "Username or email is required" }]);
    });

    it("rejects an unknown category on upload before any processing", async () => {
        const res = await request(app)
            .post("/api/v1/videos/upload")
            .set(authHeader(await createUser()))
            .field("title", "My video").field("category", "Cooking")
            .attach("video", Buffer.from("x"), { filename: "v.mp4", contentType: "video/mp4" });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([{ field: "category", message: "Invalid category" }]);
    });

    it("coerces multipart booleans for reactions and rejects anything else", async () => {
        const user = await createUser();
        const video = await createVideo(user);

        const dislike = await request(app).post(`/api/v1/reaction/${video._id}`).set(authHeader(user)).field("targetType", "Video").field("isLike", "false");
        expect(dislike.status).toBe(201);
        expect((await Like.findOne({ targetId: video._id })).isLike).toBe(false);

        const bad = await request(app).post(`/api/v1/reaction/${video._id}`).set(authHeader(user)).send({ targetType: "Video", isLike: "maybe" });
        expect(bad.status).toBe(400);
        expect(bad.body.errors[0].field).toBe("isLike");
    });

    it("validates feed query parameters", async () => {
        expect((await request(app).get("/api/v1/videos/getallvideos?category=Cooking")).status).toBe(400);
        expect((await request(app).get(`/api/v1/videos/getallvideos?query=${"x".repeat(101)}`)).status).toBe(400);
        expect((await request(app).get("/api/v1/videos/getallvideos?category=Music&query=lofi")).status).toBe(200);
    });

    it("rejects an over-long comment", async () => {
        const video = await createVideo(await createUser());
        const res = await request(app).post(`/api/v1/videos/createcomment/${video._id}`).set(authHeader(await createUser())).send({ content: "x".repeat(2001) });
        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toEqual({ field: "content", message: "Comment must be at most 2000 characters" });
    });
});
