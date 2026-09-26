import crypto from "crypto";
import JWT from "jsonwebtoken";
import { Session } from "../models/session.model.js";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// Refresh tokens rotate on every use. A token that was already rotated and shows up again after the grace
// window means someone else holds a copy, so the whole session is revoked (refresh token reuse detection).
export const ROTATION_GRACE_MS = 30 * 1000;

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const expiryOf = (token) => new Date(JWT.decode(token).exp * 1000);

const signAccessToken = (user, sessionId) =>
    JWT.sign({ id: user._id, user: user.userName, sid: String(sessionId) }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiry });

const signRefreshToken = (user, sessionId) =>
    // jti makes every issued token unique, even two issued in the same second
    JWT.sign({ id: user._id, sid: String(sessionId), jti: crypto.randomUUID() }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });

const clientInfo = (req) => ({
    userAgent: (req.get("user-agent") || "unknown").slice(0, 300),
    ip: req.ip,
});

const tokensFor = (user, sessionId, refreshToken) => {
    const accessToken = signAccessToken(user, sessionId);
    return {
        accessToken,
        refreshToken,
        accessExpiresAt: expiryOf(accessToken),
        refreshExpiresAt: expiryOf(refreshToken),
        sessionId: String(sessionId),
    };
};

// login: a new session for this device
export const createSession = async (user, req) => {
    const session = new Session({ userId: user._id, ...clientInfo(req), refreshTokenHash: "pending", expiresAt: new Date() });
    const refreshToken = signRefreshToken(user, session._id);
    session.refreshTokenHash = hashToken(refreshToken);
    session.expiresAt = expiryOf(refreshToken);
    await session.save();
    return tokensFor(user, session._id, refreshToken);
};

// refresh: verify, rotate, and hand out a new token pair; throws apiError(401) for anything unacceptable
export const rotateSession = async (incomingToken, req) => {
    let decoded;
    try {
        decoded = JWT.verify(incomingToken, config.jwt.refreshSecret);
    } catch {
        throw new apiError(401, "Invalid or expired refresh token");
    }

    const user = await User.findById(decoded.id);
    if (!user) throw new apiError(401, "Invalid refresh token");

    // tokens issued before sessions existed carry no sid: accept the one stored on the user once, then migrate
    if (!decoded.sid) {
        if (!user.refreshToken || user.refreshToken !== incomingToken) throw new apiError(401, "Invalid refresh token");
        await User.updateOne({ _id: user._id }, { $unset: { refreshToken: 1 } });
        return createSession(user, req);
    }

    if (!/^[a-f0-9]{24}$/i.test(decoded.sid)) throw new apiError(401, "Invalid refresh token");

    const incomingHash = hashToken(incomingToken);
    const now = new Date();
    const nextToken = signRefreshToken(user, decoded.sid);
    const rotation = {
        refreshTokenHash: hashToken(nextToken),
        previousTokenHash: incomingHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: expiryOf(nextToken),
        ...clientInfo(req),
    };

    // compare-and-swap: only the holder of the current token can rotate it
    let session = await Session.findOneAndUpdate(
        { _id: decoded.sid, userId: user._id, revokedAt: null, refreshTokenHash: incomingHash },
        { $set: rotation },
        { new: true }
    );

    if (!session) {
        const existing = await Session.findOne({ _id: decoded.sid, userId: user._id });
        if (!existing || existing.revokedAt) throw new apiError(401, "Session expired or revoked, please log in again");

        const withinGrace = existing.previousTokenHash === incomingHash && now - existing.rotatedAt < ROTATION_GRACE_MS;
        if (!withinGrace) {
            await Session.updateOne({ _id: existing._id }, { $set: { revokedAt: now, revokedReason: "reuse-detected" } });
            logger.warn({ userId: String(user._id), sessionId: String(existing._id), ip: req.ip }, "refresh token reuse detected, session revoked");
            throw new apiError(401, "Session revoked for security reasons, please log in again");
        }
        // a second tab refreshed with the same token moments ago: issue it a token too, keep the grace token
        session = await Session.findOneAndUpdate(
            { _id: existing._id, revokedAt: null, previousTokenHash: incomingHash },
            { $set: { ...rotation, previousTokenHash: incomingHash, rotatedAt: existing.rotatedAt } },
            { new: true }
        );
        if (!session) throw new apiError(401, "Session expired or revoked, please log in again");
    }

    return tokensFor(user, session._id, nextToken);
};

export const revokeSession = (sessionId, userId, reason = "revoked") =>
    Session.updateOne({ _id: sessionId, userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });

export const revokeOtherSessions = (userId, keepSessionId, reason = "logout-others") =>
    Session.updateMany(
        { userId, revokedAt: null, ...(keepSessionId && { _id: { $ne: keepSessionId } }) },
        { $set: { revokedAt: new Date(), revokedReason: reason } }
    );

export const listActiveSessions = (userId) =>
    Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
        .select("userAgent ip createdAt lastUsedAt expiresAt")
        .sort({ lastUsedAt: -1 })
        .lean();

// used by the auth middleware: access tokens die with their session, not 15 minutes later
export const isSessionActive = (sessionId) => Session.exists({ _id: sessionId, revokedAt: null, expiresAt: { $gt: new Date() } });
