import mongoose, { Schema } from "mongoose";

// one-time tokens sent by email (verify email, reset password). Only a SHA-256 hash is stored, like session tokens.
const userTokenSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["verify-email", "reset-password"], required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
}, { timestamps: true });

userTokenSchema.index({ tokenHash: 1 }, { unique: true });
// finding (and replacing) a user's open token for a purpose
userTokenSchema.index({ userId: 1, purpose: 1 });
// MongoDB deletes tokens once they expire
userTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserToken = mongoose.model("UserToken", userTokenSchema);
