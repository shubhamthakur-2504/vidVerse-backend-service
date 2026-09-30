import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import fs from "fs/promises";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { User } = await import("../src/models/user.model.js");

const png = Buffer.from("fake-png-bytes");
const cookieValue = (res, name) => res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`))?.split(";")[0];

describe("auth flow", () => {
    beforeEach(() => vi.clearAllMocks());

    it("registers a user without leaking the password (H13 response shape)", async () => {
        const res = await request(app)
            .post("/api/v1/user/register")
            .field("userName", "Alice")
            .field("email", "alice@example.com")
            .field("fullName", "Alice A")
            .field("password", "password123")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" })
            .attach("cover", png, { filename: "c.png", contentType: "image/png" });
        expect(res.status).toBe(201);
        expect(res.body.data.userName).toBe("alice");
        expect(res.body.data.password).toBeUndefined();
        expect(res.body.message).toBe("User registered successfully");
    });

    it("rejects a duplicate registration with 409", async () => {
        await createUser({ userName: "bob", email: "bob@example.com" });
        const res = await request(app)
            .post("/api/v1/user/register")
            .field("userName", "bob")
            .field("email", "other@example.com")
            .field("fullName", "Bob")
            .field("password", "password123")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" })
            .attach("cover", png, { filename: "c.png", contentType: "image/png" });
        expect(res.status).toBe(409);
    });

    it("registers without a cover image, but not without an avatar (M4)", async () => {
        const base = () =>
            request(app)
                .post("/api/v2/auth/register")
                .field("userName", "nocover")
                .field("email", "nocover@example.com")
                .field("fullName", "No Cover")
                .field("password", "password123");

        expect((await base()).status).toBe(400);
        expect(await User.exists({ userName: "nocover" })).toBeNull();

        const res = await base().attach("avatar", png, { filename: "a.png", contentType: "image/png" });
        expect(res.status).toBe(201);
        expect(res.body.data.avatarUrl).toMatch(/avatars\//);
        expect(res.body.data.coverImageUrl).toBeUndefined();
        expect(cloudinaryMock.uploadOnCloudinary).toHaveBeenCalledTimes(1);
    });

    it("reports whether a username is free, case-insensitively", async () => {
        await createUser({ userName: "taken.name" });
        const check = (name) => request(app).get("/api/v2/auth/username-availability").query({ userName: name });
        expect((await check("Taken.Name")).body.data).toEqual({ userName: "taken.name", available: false });
        expect((await check("free_name")).body.data).toEqual({ userName: "free_name", available: true });
        expect((await check("no spaces")).status).toBe(400);
        expect((await check("ab")).status).toBe(400);
    });

    it("rejects an invalid email with 400, not 410 (M4)", async () => {
        const res = await request(app)
            .post("/api/v2/auth/register")
            .field("userName", "bademail")
            .field("email", "not-an-email")
            .field("fullName", "Bad")
            .field("password", "password123")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" });
        expect(res.status).toBe(400);
    });

    it("fails with 502 and creates nothing when an image upload fails (M4)", async () => {
        // like the real helper, both remove the local file; the second upload fails
        cloudinaryMock.uploadOnCloudinary
            .mockImplementationOnce(async (localPath) => {
                await fs.unlink(localPath).catch(() => {});
                return {
                    url: "https://res.cloudinary.com/test/image/upload/v1/avatars/ok.png",
                    public_id: "avatars/ok",
                };
            })
            .mockImplementationOnce(async (localPath) => {
                await fs.unlink(localPath).catch(() => {});
                return null;
            });
        const res = await request(app)
            .post("/api/v2/auth/register")
            .field("userName", "flaky")
            .field("email", "flaky@example.com")
            .field("fullName", "Flaky")
            .field("password", "password123")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" })
            .attach("cover", png, { filename: "c.png", contentType: "image/png" });
        expect(res.status).toBe(502);
        expect(await User.exists({ userName: "flaky" })).toBeNull();
        // the avatar that did upload is removed again
        expect(cloudinaryMock.deleteFromCloudinary).toHaveBeenCalledWith("avatars/ok");
    });

    it.each([
        ["username", { identifier: "carol" }],
        ["username in any case", { identifier: "CaRoL" }],
        ["email", { identifier: "carol@example.com" }],
        ["legacy email field", { email: "carol@example.com" }],
    ])("logs in with %s and sets both auth cookies (H1)", async (_label, body) => {
        await createUser({ userName: "carol", email: "carol@example.com" });
        const res = await request(app)
            .post("/api/v1/user/login")
            .send({ ...body, password: "password123" });
        expect(res.status).toBe(200);
        expect(cookieValue(res, "accessToken")).toMatch(/^accessToken=ey/);
        expect(cookieValue(res, "refreshToken")).toMatch(/^refreshToken=ey/);
    });

    it("rejects a wrong password with 401", async () => {
        await createUser({ userName: "dave" });
        const res = await request(app).post("/api/v1/user/login").send({ identifier: "dave", password: "nope" });
        expect(res.status).toBe(401);
    });

    it("refreshes the access token and revokes the session on logout (C4, H3)", async () => {
        await createUser({ userName: "erin" });
        const login = await request(app)
            .post("/api/v1/user/login")
            .send({ identifier: "erin", password: "password123" });
        const refreshCookie = cookieValue(login, "refreshToken");
        const accessCookie = cookieValue(login, "accessToken");

        const refreshed = await request(app).post("/api/v1/user/refreshaccess").set("Cookie", refreshCookie);
        expect(refreshed.status).toBe(200);
        expect(cookieValue(refreshed, "accessToken")).toMatch(/^accessToken=ey/);

        const logout = await request(app).post("/api/v1/user/logout").set("Cookie", accessCookie);
        expect(logout.status).toBe(200);
        const stored = await User.findOne({ userName: "erin" });
        expect(stored.refreshToken).toBeUndefined();

        const afterLogout = await request(app).post("/api/v1/user/refreshaccess").set("Cookie", refreshCookie);
        expect(afterLogout.status).toBe(401);
    });

    it("answers 401 for a garbage refresh token (H3)", async () => {
        const res = await request(app).post("/api/v1/user/refreshaccess").set("Cookie", "refreshToken=abc.def.ghi");
        expect(res.status).toBe(401);
    });

    it("requires a token for protected routes", async () => {
        const res = await request(app).get("/api/v1/user/getcurrentuser");
        expect(res.status).toBe(401);
    });

    it("saves a new avatar url before deleting the old image (C3)", async () => {
        const user = await createUser();
        const oldUrl = user.avatarUrl;
        const login = await request(app)
            .post("/api/v1/user/login")
            .send({ identifier: user.userName, password: "password123" });
        const res = await request(app)
            .patch("/api/v1/user/changeavatar")
            .set("Cookie", cookieValue(login, "accessToken"))
            .attach("avatar", png, { filename: "n.png", contentType: "image/png" });
        expect(res.status).toBe(200);
        const stored = await User.findById(user._id);
        expect(stored.avatarUrl).not.toBe(oldUrl);
        expect(stored.avatarUrl).toMatch(/avatars\/up\d+\.png$/);
        expect(cloudinaryMock.deleteFromCloudinary).toHaveBeenCalledWith(expect.stringMatching(/^avatars\/a\d+$/));
    });
});
