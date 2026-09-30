import { z } from "zod";
import {
    objectId,
    text,
    optionalText,
    optionalLongText,
    category,
    booleanLike,
    reactionTarget,
    userName,
    newPassword,
    pageQuery,
} from "./common.js";

// ---- users ----
export const registerSchema = {
    body: z.object({
        userName,
        email: z.email("Invalid email").trim().toLowerCase(),
        fullName: text("Full name", { max: 80 }),
        password: newPassword,
    }),
};

export const loginSchema = {
    body: z
        .object({
            identifier: z.string().trim().min(1).max(254).optional(),
            email: z.string().trim().min(1).max(254).optional(),
            userName: z.string().trim().min(1).max(254).optional(),
            // existing accounts may have short passwords: only require one here
            password: z.string({ error: "Password is required" }).min(1, "Password is required").max(128),
        })
        .refine((body) => body.identifier || body.email || body.userName, {
            message: "Username or email is required",
            path: ["identifier"],
        }),
};

export const changePasswordSchema = {
    body: z.object({
        currentPassword: z
            .string({ error: "Current password is required" })
            .min(1, "Current password is required")
            .max(128),
        newPassword,
    }),
};

export const updateAccountSchema = {
    body: z
        .object({
            userName: userName.optional(),
            fullName: optionalText("Full name", { max: 80 }),
        })
        .refine((body) => body.userName || body.fullName, {
            message: "A new username or full name is required",
            path: ["userName"],
        }),
};

// ---- videos ----
export const uploadVideoSchema = {
    body: z.object({
        title: text("Title", { max: 100 }),
        description: optionalLongText("Description", 5000),
        category: category.optional(),
    }),
};

export const updateVideoSchema = {
    body: z.object({
        title: optionalText("Title", { max: 100 }),
        description: optionalLongText("Description", 5000),
        category: z.preprocess((value) => (value === "" ? undefined : value), category.optional()),
    }),
};

export const listVideosSchema = {
    query: z.object({
        category: z.preprocess((value) => (value === "" ? undefined : value), category.optional()),
        query: optionalText("Search query", { max: 100 }),
        ...pageQuery(24),
    }),
};

// ---- comments (videos and tweets) ----
export const listCommentsSchema = { query: z.object(pageQuery(20)) };

export const commentSchema = {
    body: z.object({ content: text("Comment", { max: 2000 }) }),
};

// ---- tweets ----
export const listTweetsSchema = { query: z.object(pageQuery(20)) };

export const tweetSchema = {
    body: z.object({ content: text("Content", { max: 500 }) }),
};

// ---- reactions ----
export const reactSchema = {
    body: z.object({ targetType: reactionTarget, isLike: booleanLike.default(true) }),
};
export const reactionTargetBodySchema = { body: z.object({ targetType: reactionTarget }) };
export const reactionTargetQuerySchema = { query: z.object({ targetType: reactionTarget }) };

// ---- subscriptions ----
export const paginationSchema = { query: z.object(pageQuery(20)) };

// ---- playlists ----
export const createPlaylistSchema = {
    body: z.object({
        title: optionalText("Title", { max: 100 }),
        description: optionalLongText("Description", 1000),
    }),
};
export const updatePlaylistSchema = createPlaylistSchema;

export const playlistVideoSchema = {
    body: z.object({
        playListId: objectId("playListId"),
        videoId: objectId("videoId"),
    }),
};
