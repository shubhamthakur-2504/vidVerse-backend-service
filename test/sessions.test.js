import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import JWT from "jsonwebtoken";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { Session } = await import("../src/models/session.model.js");
const { User } = await import("../src/models/user.model.js");

const cookie = (res, name) => res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`));
const value = (res, name) => cookie(res, name)?.split(";")[0];

const login = async (userName, userAgent = "device-a") =>
    request(app)
        .post("/api/v1/user/login")
        .set("User-Agent", userAgent)
        .send({ identifier: userName, password: "password123" });
const refresh = (refreshCookie) => request(app).post("/api/v1/user/refreshaccess").set("Cookie", refreshCookie);
const me = (accessCookie) => request(app).get("/api/v1/user/getcurrentuser").set("Cookie", accessCookie);

describe("per-device sessions with refresh token rotation", () => {
    afterEach(() => vi.useRealTimers());

    it("creates one session per login and binds the access token to it", async () => {
        const user = await createUser();
        const res = await login(user.userName, "Firefox on laptop");
        expect(res.status).toBe(200);

        const sessions = await Session.find({ userId: user._id });
        expect(sessions).toHaveLength(1);
        expect(sessions[0].userAgent).toBe("Firefox on laptop");
        expect(sessions[0].refreshTokenHash).toMatch(/^[a-f0-9]{64}$/); // only a hash is stored

        const access = JWT.decode(value(res, "accessToken").split("=")[1]);
        expect(access.sid).toBe(String(sessions[0]._id));
    });

    it("sets cookies that expire with their tokens and SameSite=Lax by default", async () => {
        const user = await createUser();
        const res = await login(user.userName);
        const expiresIn = (name) => (new Date(cookie(res, name).match(/Expires=([^;]+)/)[1]) - Date.now()) / 60000;
        expect(expiresIn("accessToken")).toBeGreaterThan(13);
        expect(expiresIn("accessToken")).toBeLessThanOrEqual(15);
        expect(expiresIn("refreshToken") / 60 / 24).toBeCloseTo(7, 0);
        expect(cookie(res, "refreshToken")).toMatch(/HttpOnly/);
        expect(cookie(res, "refreshToken")).toMatch(/SameSite=Lax/);
    });

    it("rotates the refresh token on every refresh", async () => {
        const user = await createUser();
        const first = value(await login(user.userName), "refreshToken");
        const res = await refresh(first);
        expect(res.status).toBe(200);
        const second = value(res, "refreshToken");
        expect(second).toBeDefined();
        expect(second).not.toBe(first);
        expect((await refresh(second)).status).toBe(200);
    });

    it("revokes the session when an already-rotated token is replayed (reuse detection)", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        const user = await createUser();
        const stolen = value(await login(user.userName), "refreshToken");
        const legit = value(await refresh(stolen), "refreshToken");

        vi.setSystemTime(Date.now() + 60_000); // past the grace window
        const replay = await refresh(stolen);
        expect(replay.status).toBe(401);
        expect((await Session.findOne({ userId: user._id })).revokedReason).toBe("reuse-detected");

        // the legitimate holder is signed out as well: the session is gone for everyone
        expect((await refresh(legit)).status).toBe(401);
    });

    it("tolerates two tabs refreshing with the same token at the same moment", async () => {
        const user = await createUser();
        const token = value(await login(user.userName), "refreshToken");
        const [a, b] = [await refresh(token), await refresh(token)];
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect(await Session.countDocuments({ userId: user._id, revokedAt: null })).toBe(1);
    });

    it("logs out only the current device, and its access token stops working immediately", async () => {
        const user = await createUser();
        const laptop = await login(user.userName, "laptop");
        const phone = await login(user.userName, "phone");

        expect(
            (await request(app).post("/api/v1/user/logout").set("Cookie", value(laptop, "accessToken"))).status
        ).toBe(200);

        expect((await me(value(laptop, "accessToken"))).status).toBe(401);
        expect((await refresh(value(laptop, "refreshToken"))).status).toBe(401);
        expect((await me(value(phone, "accessToken"))).status).toBe(200);
        expect((await refresh(value(phone, "refreshToken"))).status).toBe(200);
    });

    it("signs out every other device when the password changes", async () => {
        const user = await createUser();
        const laptop = await login(user.userName, "laptop");
        const phone = await login(user.userName, "phone");

        const res = await request(app)
            .patch("/api/v1/user/changepassword")
            .set("Cookie", value(laptop, "accessToken"))
            .send({ currentPassword: "password123", newPassword: "new-password-456" });
        expect(res.status).toBe(200);

        expect((await me(value(laptop, "accessToken"))).status).toBe(200);
        expect((await me(value(phone, "accessToken"))).status).toBe(401);
        expect((await refresh(value(phone, "refreshToken"))).status).toBe(401);
    });

    it("migrates a refresh token issued before sessions existed", async () => {
        const user = await createUser();
        const legacy = JWT.sign({ id: user._id, user: user.userName }, process.env.JWT_REFRESH_SECRET, {
            expiresIn: "7d",
        });
        await User.updateOne({ _id: user._id }, { $set: { refreshToken: legacy } });

        const res = await refresh(`refreshToken=${legacy}`);
        expect(res.status).toBe(200);
        expect(await Session.countDocuments({ userId: user._id })).toBe(1);
        expect((await User.findById(user._id)).refreshToken).toBeUndefined();
        // the legacy token cannot be used twice
        expect((await refresh(`refreshToken=${legacy}`)).status).toBe(401);
    });
});
