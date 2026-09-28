import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { cloudinaryMock } from "./cloudinaryMock.js";
import { createUser, createVideo } from "./helpers.js";

vi.mock("../src/utils/cloudinary.js", () => cloudinaryMock);
const { app } = await import("../src/app.js");

const api = (path, query = {}) => request(app).get(`/api/v2${path}`).query(query);
const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000);
const titles = (res) => res.body.data.items.map((v) => v.title);

// follow nextCursor until the last page; returns the pages' titles
const walk = async (query) => {
    const pages = [];
    let cursor;
    do {
        const res = await api("/videos", { ...query, ...(cursor && { cursor }) });
        expect(res.status).toBe(200);
        pages.push(titles(res));
        cursor = res.body.data.nextCursor;
    } while (cursor && pages.length < 20);
    return pages;
};

describe("v2: search filters on GET /videos", () => {
    it("sorts by views and pages without gaps, breaking ties by _id", async () => {
        const owner = await createUser();
        for (const [title, views] of [["low", 1], ["top", 90], ["tieA", 50], ["tieB", 50], ["mid", 20]]) {
            await createVideo(owner, { title: `sorted ${title}`, views });
        }
        await createVideo(owner, { title: "other topic", views: 1000 });

        const pages = await walk({ query: "sorted", sort: "views", limit: 2 });
        expect(pages).toEqual([["sorted top", "sorted tieB"], ["sorted tieA", "sorted mid"], ["sorted low"]]);

        // newest stays the default
        expect(titles(await api("/videos", { query: "sorted" }))[0]).toBe("sorted mid");
    });

    it("filters by upload date", async () => {
        const owner = await createUser();
        await createVideo(owner, { title: "fresh", createdAt: hoursAgo(0.5) });
        await createVideo(owner, { title: "yesterday", createdAt: hoursAgo(30) });
        await createVideo(owner, { title: "last month", createdAt: hoursAgo(24 * 20) });
        await createVideo(owner, { title: "ancient", createdAt: hoursAgo(24 * 400) });

        expect(titles(await api("/videos", { uploaded: "hour" }))).toEqual(["fresh"]);
        expect(titles(await api("/videos", { uploaded: "today" }))).toEqual(["fresh"]);
        expect(titles(await api("/videos", { uploaded: "week" }))).toEqual(["fresh", "yesterday"]);
        expect(titles(await api("/videos", { uploaded: "month" }))).toEqual(["fresh", "yesterday", "last month"]);
        expect(titles(await api("/videos", { uploaded: "year" }))).toHaveLength(3);
        expect(titles(await api("/videos"))).toHaveLength(4);
    });

    it("filters by duration: under 4 minutes, 4 to 20, over 20", async () => {
        const owner = await createUser();
        for (const [title, duration] of [["clip", 239], ["four", 240], ["twenty", 1200], ["film", 1201]]) {
            await createVideo(owner, { title, duration });
        }
        const sorted = async (duration) => titles(await api("/videos", { duration })).sort();

        expect(await sorted("short")).toEqual(["clip"]);
        expect(await sorted("medium")).toEqual(["four", "twenty"]);
        expect(await sorted("long")).toEqual(["film"]);
    });

    it("combines the filters with the search text and pages the date filter", async () => {
        const owner = await createUser();
        await createVideo(owner, { title: "lofi a", duration: 3000, createdAt: hoursAgo(1) });
        await createVideo(owner, { title: "lofi b", duration: 3000, createdAt: hoursAgo(2) });
        await createVideo(owner, { title: "lofi c", duration: 3000, createdAt: hoursAgo(3) });
        await createVideo(owner, { title: "lofi short", duration: 60, createdAt: hoursAgo(1) });
        await createVideo(owner, { title: "lofi old", duration: 3000, createdAt: hoursAgo(24 * 10) });
        await createVideo(owner, { title: "jazz", duration: 3000, createdAt: hoursAgo(1) });

        expect(await walk({ query: "lofi", duration: "long", uploaded: "week", limit: 2 })).toEqual([["lofi a", "lofi b"], ["lofi c"]]);
    });

    it.each([
        ["an unknown sort", { sort: "rating" }, "sort must be newest or views"],
        ["an unknown upload date", { uploaded: "decade" }, "Invalid upload date filter"],
        ["an unknown duration", { duration: "huge" }, "duration must be short, medium or long"],
    ])("rejects %s with 400", async (_label, query, detail) => {
        const res = await api("/videos", query);
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toContain(detail);
    });

    it("rejects a cursor from the other sort order", async () => {
        const owner = await createUser();
        for (let i = 0; i < 3; i++) await createVideo(owner, { views: i });

        const newest = await api("/videos", { limit: 1 });
        const res = await api("/videos", { sort: "views", cursor: newest.body.data.nextCursor });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid cursor");
    });

    it("leaves v1 unfiltered", async () => {
        const owner = await createUser();
        await createVideo(owner, { title: "short one", duration: 10 });
        await createVideo(owner, { title: "long one", duration: 5000 });

        const res = await request(app).get("/api/v1/videos/getallvideos").query({ duration: "short" });
        expect(res.status).toBe(200);
        expect(titles(res)).toHaveLength(2);
    });
});
