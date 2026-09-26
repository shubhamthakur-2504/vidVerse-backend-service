import { rateLimit } from "express-rate-limit";
import { apiError } from "../utils/apiError.js";
import { config } from "../config.js";

// limits are per client ip (req.ip, which respects TRUST_PROXY); rejections go through the normal error handler
export const createRateLimiter = ({ windowMs, limit, message, enabled = config.env !== "test" }) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-8", // RateLimit / RateLimit-Policy headers so clients can back off
        legacyHeaders: false,
        skip: () => !enabled,
        handler: (req, res, next) => next(new apiError(429, message)),
    });

const MINUTE = 60 * 1000;

// every API request: stops floods and scraping without affecting normal browsing
export const apiLimiter = createRateLimiter({
    windowMs: 15 * MINUTE,
    limit: 1000,
    message: "Too many requests, please slow down",
});

// credential endpoints: brute-force protection
export const authLimiter = createRateLimiter({
    windowMs: 15 * MINUTE,
    limit: 20,
    message: "Too many attempts, please try again in a few minutes",
});

// video uploads are expensive (ffmpeg + Cloudinary)
export const uploadLimiter = createRateLimiter({
    windowMs: 60 * MINUTE,
    limit: 30,
    message: "Upload limit reached, please try again later",
});
