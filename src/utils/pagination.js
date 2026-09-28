import mongoose from "mongoose";
import { apiError } from "./apiError.js";

// Cursor pagination over (createdAt, _id), newest first. The cursor is an opaque string the client sends back
// as ?cursor=...; unlike page numbers it stays correct while new items are added, and it is served by the
// { ..., createdAt: -1, _id: -1 } indexes. _id breaks ties between items created in the same millisecond.
// Search can also sort by (views, _id); every helper takes the sort field, createdAt by default.

export const NEWEST_FIRST = { createdAt: -1, _id: -1 };
export const MOST_VIEWED = { views: -1, _id: -1 };

// how each sort field is stored in the cursor; a cursor from one sort order is rejected by another
const CURSOR_FIELDS = {
    createdAt: {
        key: "c",
        encode: (value) => new Date(value).toISOString(),
        decode: (value) => {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) throw new Error("bad cursor");
            return date;
        },
    },
    views: {
        key: "v",
        encode: (value) => Number(value) || 0,
        decode: (value) => {
            if (!Number.isInteger(value) || value < 0) throw new Error("bad cursor");
            return value;
        },
    },
};

export const encodeCursor = (doc, field = "createdAt") => {
    const { key, encode } = CURSOR_FIELDS[field];
    return Buffer.from(JSON.stringify({ [key]: encode(doc[field]), i: String(doc._id) })).toString("base64url");
};

export const decodeCursor = (cursor, field = "createdAt") => {
    if (!cursor) return null;
    const { key, decode } = CURSOR_FIELDS[field];
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (!(key in parsed) || !/^[a-f0-9]{24}$/i.test(parsed.i)) throw new Error("bad cursor");
        return { [field]: decode(parsed[key]), _id: mongoose.Types.ObjectId.createFromHexString(parsed.i) };
    } catch {
        throw new apiError(400, "Invalid cursor");
    }
};

// $match condition for "items after this cursor" in (field desc, _id desc) order ({} for the first page)
export const afterCursor = (cursor, field = "createdAt") =>
    cursor ? { $or: [{ [field]: { $lt: cursor[field] } }, { [field]: cursor[field], _id: { $lt: cursor._id } }] } : {};

// query with limit + 1, then pass the docs here: the extra doc only tells whether another page exists
export const pageOf = (docs, limit, field = "createdAt") => {
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1], field) : null };
};
