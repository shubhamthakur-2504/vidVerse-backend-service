import { describe, it, expect, vi, afterEach } from "vitest";

// config is evaluated at import time, so each case re-imports it with a modified environment
const loadConfig = async (overrides) => {
    vi.resetModules();
    const saved = { ...process.env };
    Object.assign(process.env, overrides);
    for (const [key, value] of Object.entries(overrides)) if (value === undefined) delete process.env[key];
    try {
        return await import("../src/config.js");
    } finally {
        process.env = saved;
    }
};

describe("config", () => {
    afterEach(() => vi.resetModules());

    it("fails fast with a readable message when a required variable is missing", async () => {
        await expect(loadConfig({ JWT_ACCESS_SECRET: undefined, CLOUDINARY_API_KEY: "" })).rejects.toThrow(
            /Invalid environment configuration:[\s\S]*JWT_ACCESS_SECRET is required[\s\S]*CLOUDINARY_API_KEY is required/
        );
    });

    it("uses APP_URL for emailed links, falling back to the first client origin", async () => {
        expect((await loadConfig({ APP_URL: "https://vidverse.example/", CLIENT_URLS: "http://a.test" })).config.appUrl).toBe("https://vidverse.example");
        const fallback = (await loadConfig({ APP_URL: undefined, CLIENT_URLS: "http://a.test,http://b.test", SMTP_URL: undefined })).config;
        expect(fallback.appUrl).toBe("http://a.test");
        expect(fallback.mail.smtpUrl).toBeNull();
        await expect(loadConfig({ APP_URL: "not a url" })).rejects.toThrow(/APP_URL/);
    });

    it("rejects a non-numeric upload limit", async () => {
        await expect(loadConfig({ MAX_VIDEO_SIZE_MB: "lots" })).rejects.toThrow(/MAX_VIDEO_SIZE_MB/);
    });

    it("parses lists, numbers and defaults", async () => {
        const { config } = await loadConfig({
            CLIENT_URLS: " http://a.test , http://b.test,",
            TRUST_PROXY: "1",
            MAX_IMAGE_SIZE_MB: "2.5",
            COOKIE_SAME_SITE: undefined,
        });
        expect(config.clientUrls).toEqual(["http://a.test", "http://b.test"]);
        expect(config.trustProxy).toBe(1);
        expect(config.uploads.maxImageBytes).toBe(Math.floor(2.5 * 1024 * 1024));
        expect(config.cookies).toEqual({ sameSite: "lax", secure: false });
        expect(Object.isFrozen(config)).toBe(true);
    });

    it.each([
        ["mongodb+srv://u:p@cluster.example.net/?retryWrites=true&w=majority", "mongodb+srv://u:p@cluster.example.net/vidVerseDB?retryWrites=true&w=majority"],
        ["mongodb+srv://u:p@cluster.example.net", "mongodb+srv://u:p@cluster.example.net/vidVerseDB"],
        ["mongodb://localhost:27017/", "mongodb://localhost:27017/vidVerseDB"],
    ])("builds a database url from %s", async (url, expected) => {
        const { mongoUrlFor } = await loadConfig({ MONGODB_URL: url });
        expect(mongoUrlFor("vidVerseDB")).toBe(expected);
    });
});
