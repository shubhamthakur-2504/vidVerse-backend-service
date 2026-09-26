import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("app basics", () => {
    it("answers the health check", async () => {
        const res = await request(app).get("/api/v1/healthcheck");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it("rejects a malformed JSON body with 400", async () => {
        const res = await request(app).post("/api/v1/user/login").set("Content-Type", "application/json").send("{bad");
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Malformed JSON body");
    });

    it("rejects origins outside CLIENT_URLS with 403", async () => {
        const res = await request(app).get("/api/v1/healthcheck").set("Origin", "http://evil.test");
        expect(res.status).toBe(403);
    });

    it("does not serve the upload temp folder (S3)", async () => {
        const res = await request(app).get("/temps/.gitkeep");
        expect(res.status).toBe(404);
    });

    it("rejects malformed ids with 400 before any handler (H12)", async () => {
        const res = await request(app).get("/api/v1/tweets/gettweet/not-an-id");
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid id");
    });

    it("returns 404, not 500, for a missing tweet (M1)", async () => {
        const res = await request(app).get("/api/v1/tweets/gettweet/507f1f77bcf86cd799439011");
        expect(res.status).toBe(404);
    });
});
