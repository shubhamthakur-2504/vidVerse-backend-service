import mongoose, { Schema } from "mongoose";

// One document per logged-in device. Only a hash of the device's current refresh token is stored.
const sessionSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // sha256 of the refresh token currently issued to this device
        refreshTokenHash: {
            type: String,
            required: true,
        },
        // the token it replaced, accepted again only within a short grace window (two tabs refreshing at once)
        previousTokenHash: String,
        rotatedAt: Date,
        userAgent: String,
        ip: String,
        lastUsedAt: {
            type: Date,
            default: Date.now,
        },
        // sliding expiry (refresh token lifetime); the TTL index deletes the document afterwards
        expiresAt: {
            type: Date,
            required: true,
        },
        revokedAt: Date,
        revokedReason: {
            type: String,
            enum: ["logout", "revoked", "logout-others", "password-change", "reuse-detected"],
        },
    },
    { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model("Session", sessionSchema);
