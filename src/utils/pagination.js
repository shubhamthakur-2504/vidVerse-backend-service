import mongoose from "mongoose";
import { apiError } from "./apiError.js";

// Cursor pagination over (createdAt, _id), newest first. The cursor is an opaque string the client sends back
// as ?cursor=...; unlike page numbers it stays correct while new items are added, and it is served by the
// { ..., createdAt: -1, _id: -1 } indexes. _id breaks ties between items created in the same millisecond.

export const NEWEST_FIRST = { createdAt: -1, _id: -1 };

export const encodeCursor = (doc) =>
    Buffer.from(JSON.stringify({ c: new Date(doc.createdAt).toISOString(), i: String(doc._id) })).toString("base64url");

export const decodeCursor = (cursor) => {
    if (!cursor) return null;
    try {
        const { c, i } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        const createdAt = new Date(c);
        if (Number.isNaN(createdAt.getTime()) || !/^[a-f0-9]{24}$/i.test(i)) throw new Error("bad cursor");
        return { createdAt, _id: mongoose.Types.ObjectId.createFromHexString(i) };
    } catch {
        throw new apiError(400, "Invalid cursor");
    }
};

// $match condition for "items after this cursor" in NEWEST_FIRST order ({} for the first page)
export const afterCursor = (cursor) =>
    cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] } : {};

// query with limit + 1, then pass the docs here: the extra doc only tells whether another page exists
export const pageOf = (docs, limit) => {
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
};
