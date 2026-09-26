import { z } from "zod";
import { objectId, optionalText, optionalLongText, booleanLike, pageQuery } from "./common.js";
import { updateVideoSchema } from "./index.js";

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

// PATCH /videos/:videoId also sets visibility (replaces the v1 toggle endpoint)
export const updateVideoV2Schema = {
    body: updateVideoSchema.body.extend({ isPublished: booleanLike.optional() }),
};

export const channelVideosSchema = { query: z.object(pageQuery(24)) };

export const relatedVideosSchema = {
    query: z.object({ limit: z.coerce.number().int().min(1).max(24).default(12) }),
};
