import { z } from "zod";
import {
    objectId,
    text,
    optionalText,
    optionalLongText,
    booleanLike,
    pageQuery,
    category,
    userName,
    newPassword,
} from "./common.js";
import { updateVideoSchema, listVideosSchema } from "./index.js";

// GET /videos: the feed and search results, with the search filters
export const listVideosV2Schema = {
    query: listVideosSchema.query.extend({
        sort: z.enum(["newest", "views"], { error: "sort must be newest or views" }).default("newest"),
        uploaded: z
            .enum(["hour", "today", "week", "month", "year"], { error: "Invalid upload date filter" })
            .optional(),
        duration: z.enum(["short", "medium", "long"], { error: "duration must be short, medium or long" }).optional(),
    }),
};

// GET /me/notifications, POST /me/notifications/read { ids? } (no ids: mark everything read)
export const listNotificationsSchema = { query: z.object(pageQuery(20)) };
export const markNotificationsReadSchema = {
    body: z.object({ ids: z.array(objectId("id")).min(1).max(100).optional() }),
};

// GET /auth/username-availability?userName=: the live check on the register form
export const userNameAvailabilitySchema = { query: z.object({ userName }) };

// one-time tokens from emailed links (base64url, 43 characters)
const emailedToken = z
    .string({ error: "Token is required" })
    .trim()
    .regex(/^[A-Za-z0-9_-]{20,200}$/, "Invalid token");

// POST /auth/verify-email
export const verifyEmailSchema = { body: z.object({ token: emailedToken }) };
// POST /auth/forgot-password
export const forgotPasswordSchema = {
    body: z.object({ email: z.email("Enter a valid email address").trim().toLowerCase() }),
};
// POST /auth/reset-password
export const resetPasswordSchema = { body: z.object({ token: emailedToken, password: newPassword }) };

// PUT /reactions/:targetType/:id
export const setReactionSchema = {
    body: z.object({ value: z.enum(["like", "dislike"], { error: "value must be like or dislike" }) }),
};

// POST /playlists: a playlist starts with one video
export const createPlaylistV2Schema = {
    body: z.object({
        videoId: objectId("videoId"),
        title: optionalText("Title", { max: 100 }),
        description: optionalLongText("Description", 1000),
    }),
};

// GET /playlists?videoId=: mark which of my playlists already hold this video
export const myPlaylistsSchema = { query: z.object({ videoId: objectId("videoId").optional() }) };

// PATCH /videos/:videoId also sets visibility (replaces the v1 toggle endpoint)
export const updateVideoV2Schema = {
    body: updateVideoSchema.body.extend({ isPublished: booleanLike.optional() }),
};

export const channelVideosSchema = { query: z.object(pageQuery(24)) };
export const subscriptionFeedSchema = { query: z.object(pageQuery(24)) };

// POST /videos/from-upload: register a file the browser uploaded straight to Cloudinary
export const createFromUploadSchema = {
    body: z.object({
        publicId: z.string().regex(/^uploads\/[a-f0-9]{24}\/[0-9a-f-]{36}$/i, "Invalid upload id"),
        title: text("Title", { max: 100 }),
        description: optionalLongText("Description", 5000),
        category: z.preprocess((value) => (value === "" ? undefined : value), category.optional()),
    }),
};

export const relatedVideosSchema = {
    query: z.object({ limit: z.coerce.number().int().min(1).max(24).default(12) }),
};
