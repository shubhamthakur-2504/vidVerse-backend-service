import { config } from "../config.js";

// every auth cookie is set and cleared with the same options, so the browser always matches them up
const baseOptions = () => ({
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: "/",
});

// each cookie expires together with its token, so the browser drops an expired access token by itself
export const setAuthCookies = (res, { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt }) =>
    res
        .cookie("accessToken", accessToken, { ...baseOptions(), expires: accessExpiresAt })
        .cookie("refreshToken", refreshToken, { ...baseOptions(), expires: refreshExpiresAt });

export const clearAuthCookies = (res) =>
    res.clearCookie("accessToken", baseOptions()).clearCookie("refreshToken", baseOptions());
