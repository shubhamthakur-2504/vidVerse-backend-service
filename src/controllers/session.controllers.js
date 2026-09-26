import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { listActiveSessions, revokeSession, revokeOtherSessions } from "../services/session.service.js";
import { clearAuthCookies } from "../utils/authCookies.js";

// the signed-in user's devices, most recently used first; `current` marks the device making the request
const listSessions = asyncHandler(async (req, res) => {
    const sessions = await listActiveSessions(req.user._id);
    const items = sessions.map((session) => ({ ...session, current: String(session._id) === req.sessionId }));
    return res.status(200).json(new apiResponse(200, items, "Sessions fetched successfully"));
});

// sign one device out; signing out the current device also clears its cookies
const revokeSessionById = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const result = await revokeSession(sessionId, req.user._id, "revoked");
    if (result.matchedCount === 0) {
        throw new apiError(404, "Session not found");
    }
    if (sessionId === req.sessionId) clearAuthCookies(res);
    return res.status(200).json(new apiResponse(200, { _id: sessionId }, "Session revoked"));
});

// "log out other devices"
const revokeOtherSessionsForUser = asyncHandler(async (req, res) => {
    const result = await revokeOtherSessions(req.user._id, req.sessionId, "logout-others");
    return res.status(200).json(new apiResponse(200, { revoked: result.modifiedCount }, "Other sessions revoked"));
});

export { listSessions, revokeSessionById, revokeOtherSessionsForUser };
