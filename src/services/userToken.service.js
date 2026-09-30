import crypto from "crypto";
import { UserToken } from "../models/userToken.model.js";
import { hashToken } from "./session.service.js";

const LIFETIME_MS = { "verify-email": 24 * 60 * 60 * 1000, "reset-password": 60 * 60 * 1000 };

// a fresh random token for an emailed link; it replaces any unused one for the same purpose,
// so only the most recent email works
export const issueUserToken = async (userId, purpose) => {
    const token = crypto.randomBytes(32).toString("base64url");
    await UserToken.deleteMany({ userId, purpose, usedAt: null });
    await UserToken.create({
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LIFETIME_MS[purpose]),
    });
    return token;
};

// marks the token used and returns its user id, or null when it is unknown, used, expired or for another purpose.
// the single conditional update makes a token usable exactly once, even with two requests at the same time
export const consumeUserToken = async (token, purpose) => {
    const used = await UserToken.findOneAndUpdate(
        { tokenHash: hashToken(token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } }
    );
    return used?.userId ?? null;
};
