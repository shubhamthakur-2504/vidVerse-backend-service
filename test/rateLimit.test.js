import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createRateLimiter, authLimiter } from "../src/middleWares/rateLimit.middleWare.js";

// a tiny app with the real limiter factory and an error handler shaped like the API's
const appWith = (limiter) => {
    const app = express();
    app.set("trust proxy", 1); // lets each test pick a client ip via X-Forwarded-For
    app.post("/login", limiter, (req, res) => res.json({ ok: true }));
    app.use((err, req, res, _next) => res.status(err.statusCode ?? 500).json({ statusCode: err.statusCode, message: err.message }));
    return app;
};

describe("rate limiting (S5)", () => {
    it("rejects requests over the limit with 429 and the API error shape", async () => {
        const app = appWith(createRateLimiter({ windowMs: 60_000, limit: 2, message: "Too many attempts", enabled: true }));
        const as = (ip) => request(app).post("/login").set("X-Forwarded-For", ip);

        expect((await as("1.1.1.1")).status).toBe(200);
        const second = await as("1.1.1.1");
        expect(second.status).toBe(200);
        expect(second.headers["ratelimit-policy"]).toMatch(/q=2/);

        const third = await as("1.1.1.1");
        expect(third.status).toBe(429);
        expect(third.body).toEqual({ statusCode: 429, message: "Too many attempts" });

        // another client has its own budget
        expect((await as("2.2.2.2")).status).toBe(200);
    });

    it("is disabled by default under NODE_ENV=test so other suites are unaffected", async () => {
        const app = appWith(authLimiter);
        for (let i = 0; i < 25; i++) {
            expect((await request(app).post("/login")).status).toBe(200);
        }
    });
});
