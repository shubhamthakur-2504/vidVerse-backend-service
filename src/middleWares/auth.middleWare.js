import JWT from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import  asyncHandler  from "../utils/asyncHandler.js";
import { config } from "../config.js";
import { isSessionActive } from "../services/session.service.js";

const tokenFrom = (req) => req.headers.authorization?.split(" ")[1] || req.cookies.accessToken

// resolves the user behind an access token, or null when the token is invalid, the user is gone,
// or the token's session was revoked (logout, "log out other devices", password change, reuse detection).
// tokens issued before sessions existed carry no sid and are accepted until they expire.
const userFromToken = async (token) => {
    let decoded
    try {
        decoded = JWT.verify(token, config.jwt.accessSecret)
    } catch {
        return { user: null }
    }
    const [user, sessionActive] = await Promise.all([
        User.findById(decoded?.id).select("-password -refreshToken"),
        decoded?.sid ? isSessionActive(decoded.sid) : true,
    ])
    if (!user || !sessionActive) return { user: null }
    return { user, sessionId: decoded.sid ?? null }
}

export const verifyJwtToken = asyncHandler(async (req,_, next) => {
    const token = tokenFrom(req)
    if (!token){
        throw new apiError(401,"Access token is required")
    }
    const { user, sessionId } = await userFromToken(token)
    if(!user){
        throw new apiError(401,"Invalid or expired access token")
    }
    req.user = user
    req.sessionId = sessionId
    next()
})

export const lightVerifyJwtToken = asyncHandler(async (req,_, next) => {
    const token = tokenFrom(req)
    const { user, sessionId } = token ? await userFromToken(token) : { user: null }
    // next() stays outside any try so errors thrown further down the chain are not swallowed or re-run
    req.user = user
    req.sessionId = sessionId ?? null
    return next()
})
