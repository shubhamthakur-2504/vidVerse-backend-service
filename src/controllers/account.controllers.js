import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { issueUserToken, consumeUserToken } from "../services/userToken.service.js";
import { revokeOtherSessions } from "../services/session.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/mail.service.js";
import { clearAuthCookies } from "../utils/authCookies.js";
import { logger } from "../utils/logger.js";

// Email verification and password reset (v2). Links carry one-time tokens; see services/userToken.service.js.

const INVALID_LINK = "This link is invalid or has expired. Request a new one.";

// best effort, used after registration: a mail problem must never fail the request that triggered it
export const sendEmailVerification = async (user) => {
    try {
        return await sendVerificationEmail(user, await issueUserToken(user._id, "verify-email"));
    } catch (error) {
        logger.error({ err: error, userId: user._id }, "could not send the verification email");
        return false;
    }
};

// POST /v2/auth/email-verification: (re)send the link to the signed-in user
const requestEmailVerification = asyncHandler(async (req, res) => {
    if (req.user.emailVerifiedAt) {
        throw new apiError(409, "Your email is already verified");
    }
    const sent = await sendEmailVerification(req.user);
    if (!sent) {
        throw new apiError(503, "We couldn't send the email right now. Try again later.");
    }
    return res.status(202).json(new apiResponse(202, { sent: true }, "Verification email sent"));
});

// POST /v2/auth/verify-email { token }
const verifyEmail = asyncHandler(async (req, res) => {
    const userId = await consumeUserToken(req.body.token, "verify-email");
    if (!userId) throw new apiError(400, INVALID_LINK);
    // keep the first verification time if the address was already verified
    await User.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });
    return res.status(200).json(new apiResponse(200, { emailVerified: true }, "Email verified"));
});

// POST /v2/auth/forgot-password { email }: the same answer whether or not the address has an account,
// so the endpoint cannot be used to find out who is registered
const forgotPassword = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select("email userName fullName");
    if (user) {
        await sendPasswordResetEmail(user, await issueUserToken(user._id, "reset-password"));
    }
    return res
        .status(202)
        .json(new apiResponse(202, null, "If an account uses that email, we've sent a link to reset the password"));
});

// POST /v2/auth/reset-password { token, password }: sets the new password and signs every device out
const resetPassword = asyncHandler(async (req, res) => {
    const userId = await consumeUserToken(req.body.token, "reset-password");
    if (!userId) throw new apiError(400, INVALID_LINK);
    const user = await User.findById(userId);
    if (!user) throw new apiError(400, INVALID_LINK);

    user.password = req.body.password;
    // the pre-session refresh token could otherwise still be exchanged for a new session
    user.refreshToken = undefined;
    // the reset link reached this inbox, which proves the address
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    await user.save();
    await revokeOtherSessions(user._id, null, "password-reset");

    clearAuthCookies(res);
    return res.status(200).json(new apiResponse(200, null, "Password updated. Sign in with your new password."));
});

export { requestEmailVerification, verifyEmail, forgotPassword, resetPassword };
