import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, authHeader } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");
const { outbox } = await import("../src/services/mail.service.js");
const { UserToken } = await import("../src/models/userToken.model.js");

const api = (method, path) => request(app)[method](`/api/v2${path}`);
const png = Buffer.from("fake-png-bytes");
const cookieOf = (res, name) => res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`))?.split(";")[0];
// the one-time token from the link in the most recent email to `to`
const tokenFromMail = (to) => {
    const mail = outbox.filter((m) => m.to === to).at(-1);
    return /token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1];
};

describe("v2: email verification", () => {
    beforeEach(() => { outbox.length = 0; });

    it("emails a link at registration that verifies the address once", async () => {
        const reg = await api("post", "/auth/register")
            .field("userName", "verifyme").field("email", "verify@example.com").field("fullName", "Verify Me").field("password", "password123")
            .attach("avatar", png, { filename: "a.png", contentType: "image/png" });
        expect(reg.status).toBe(201);
        expect(reg.body.data.emailVerifiedAt).toBeNull();

        const mail = outbox.at(-1);
        expect(mail).toMatchObject({ to: "verify@example.com", subject: expect.stringMatching(/confirm your email/i) });
        expect(mail.text).toContain("/auth/verify-email?token=");
        const token = tokenFromMail("verify@example.com");

        expect((await api("post", "/auth/verify-email").send({ token })).status).toBe(200);
        const login = await api("post", "/auth/login").send({ identifier: "verifyme", password: "password123" });
        const me = await api("get", "/me").set("Cookie", cookieOf(login, "accessToken"));
        expect(me.body.data.emailVerifiedAt).toBeTruthy();

        // single use, and only the stored hash exists in the database
        expect((await api("post", "/auth/verify-email").send({ token })).status).toBe(400);
        expect(await UserToken.exists({ tokenHash: token })).toBeNull();
    });

    it("re-sends the link to a signed-in user; only the newest link works", async () => {
        const user = await createUser({ email: "resend@example.com" });
        expect((await api("post", "/auth/email-verification").set(authHeader(user))).status).toBe(202);
        const first = tokenFromMail("resend@example.com");
        expect((await api("post", "/auth/email-verification").set(authHeader(user))).status).toBe(202);
        const second = tokenFromMail("resend@example.com");
        expect(second).not.toBe(first);

        expect((await api("post", "/auth/verify-email").send({ token: first })).status).toBe(400);
        expect((await api("post", "/auth/verify-email").send({ token: second })).status).toBe(200);
        expect((await api("post", "/auth/email-verification").set(authHeader(user))).status).toBe(409);
        expect((await api("post", "/auth/email-verification")).status).toBe(401);
    });

    it("rejects malformed and expired tokens", async () => {
        const user = await createUser({ email: "late@example.com" });
        await api("post", "/auth/email-verification").set(authHeader(user));
        const token = tokenFromMail("late@example.com");
        await UserToken.updateMany({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

        expect((await api("post", "/auth/verify-email").send({ token })).status).toBe(400);
        expect((await api("post", "/auth/verify-email").send({ token: "not a token!" })).status).toBe(400);
    });
});

describe("v2: password reset", () => {
    beforeEach(() => { outbox.length = 0; });

    it("answers the same for unknown emails and sends nothing", async () => {
        const res = await api("post", "/auth/forgot-password").send({ email: "nobody@example.com" });
        expect(res.status).toBe(202);
        expect(outbox).toHaveLength(0);
        expect((await api("post", "/auth/forgot-password").send({ email: "nope" })).status).toBe(400);
    });

    it("resets the password with the emailed link and signs every device out", async () => {
        const user = await createUser({ userName: "forgetful", email: "Forgetful@Example.com" });
        const before = await api("post", "/auth/login").send({ identifier: "forgetful", password: "password123" });
        const oldAccess = cookieOf(before, "accessToken");

        const asked = await api("post", "/auth/forgot-password").send({ email: "FORGETFUL@example.com" });
        expect(asked.status).toBe(202);
        const token = tokenFromMail(user.email);
        expect(token).toBeTruthy();

        expect((await api("post", "/auth/reset-password").send({ token, password: "short" })).status).toBe(400);
        const reset = await api("post", "/auth/reset-password").send({ token, password: "brand-new-pass" });
        expect(reset.status).toBe(200);

        expect((await api("get", "/me").set("Cookie", oldAccess)).status).toBe(401);
        expect((await api("post", "/auth/login").send({ identifier: "forgetful", password: "password123" })).status).toBe(401);
        const after = await api("post", "/auth/login").send({ identifier: "forgetful", password: "brand-new-pass" });
        expect(after.status).toBe(200);
        // opening the reset link proved the address
        expect((await api("get", "/me").set("Cookie", cookieOf(after, "accessToken"))).body.data.emailVerifiedAt).toBeTruthy();

        expect((await api("post", "/auth/reset-password").send({ token, password: "another-pass" })).status).toBe(400);
    });

    it("does not accept a verification token as a reset token", async () => {
        const user = await createUser({ email: "mixup@example.com" });
        await api("post", "/auth/email-verification").set(authHeader(user));
        const token = tokenFromMail("mixup@example.com");
        expect((await api("post", "/auth/reset-password").send({ token, password: "brand-new-pass" })).status).toBe(400);
    });
});
