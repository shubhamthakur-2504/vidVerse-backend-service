import { z } from "zod";
import { Video } from "../models/video.model.js";

export const objectId = (name = "id") => z.string().regex(/^[a-f0-9]{24}$/i, `${name} must be a valid id`);

// trimmed text with a length range; `optional` also turns "" into undefined (multipart forms send empty fields)
export const text = (name, { min = 1, max }) =>
    z.string({ error: `${name} is required` }).trim().min(min, min === 1 ? `${name} is required` : `${name} must be at least ${min} characters`).max(max, `${name} must be at most ${max} characters`);

export const optionalText = (name, options) =>
    z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), text(name, options).optional());

// descriptions may be cleared, so an empty string is kept
export const optionalLongText = (name, max) => z.string().trim().max(max, `${name} must be at most ${max} characters`).optional();

export const category = z.enum(Video.schema.path("category").enumValues, { error: "Invalid category" });

// booleans arrive as real booleans in JSON and as "true"/"false" strings in multipart forms
export const booleanLike = z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]);

export const reactionTarget = z.enum(["Video", "Tweet", "Comment"], { error: "Invalid target type" });

export const userName = z
    .string({ error: "Username is required" })
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-z0-9._-]+$/, "Username may only contain letters, numbers, dots, dashes and underscores");

export const newPassword = z.string({ error: "Password is required" }).min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters");
