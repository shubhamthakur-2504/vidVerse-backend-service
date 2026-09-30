import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js"
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js"
import { extractPublicId } from "../utils/utils.js";
import { createSession, rotateSession, revokeSession, revokeOtherSessions } from "../services/session.service.js";
import { setAuthCookies, clearAuthCookies } from "../utils/authCookies.js";
import fs from "fs"
import { logger } from "../utils/logger.js";

function deleteLocalFile(filePath) {
    try {
        fs.unlinkSync(filePath)
    } catch (error) {
        logger.warn({ err: error, filePath }, "could not delete local file")
    }
}

// register: name, email and password are checked by registerSchema; the avatar is required, the cover optional (M4)
const registerUser = asyncHandler(async (req, res) => {

    const { userName, email, password, fullName } = req.body
    const avatarLocal = req.files?.avatar?.[0]?.path
    const coverLocal = req.files?.cover?.[0]?.path
    const discardLocalFiles = () => {
        if (avatarLocal) deleteLocalFile(avatarLocal)
        if (coverLocal) deleteLocalFile(coverLocal)
    }

    if (!avatarLocal) {
        discardLocalFiles()
        throw new apiError(400, "Avatar is required")
    }

    if (await User.exists({ $or: [{ userName: userName }, { email: email }] })) {
        discardLocalFiles()
        throw new apiError(409, "User already exists")
    }

    // the upload helper removes the local file whether or not the upload succeeds, and returns null on failure
    const avatar = await uploadOnCloudinary(avatarLocal, "avatar")
    const cover = coverLocal ? await uploadOnCloudinary(coverLocal, "cover") : null
    const discardUploads = async () => {
        if (avatar?.public_id) await deleteFromCloudinary(avatar.public_id)
        if (cover?.public_id) await deleteFromCloudinary(cover.public_id)
    }

    if (!avatar?.url || (coverLocal && !cover?.url)) {
        await discardUploads()
        throw new apiError(502, "Could not upload your images, please try again")
    }

    try {
        const user = await User.create({
            userName: userName,
            email: email,
            password: password,
            fullName: fullName,
            avatarUrl: avatar.url,
            coverImageUrl: cover?.url
        })
        const createdUser = await User.findById(user._id).select("-password -refreshToken -__v -createdAt -updatedAt -watchHistory")
        if (!createdUser) {
            throw new apiError(500, "Something went wrong while registering user")
        }

        return res.status(201).json(new apiResponse(201, createdUser, "User registered successfully"))
    } catch (error) {
        await discardUploads()
        throw new apiError(500, "Something went wrong while registering user and images were deleted")
    }
})

// v2: GET /auth/username-availability?userName= (the format is already checked and lowercased by the validator)
const checkUserNameAvailability = asyncHandler(async (req, res) => {
    const { userName } = req.query
    const taken = await User.exists({ userName })
    return res.status(200).json(new apiResponse(200, { userName, available: !taken }, taken ? "Username is taken" : "Username is available"))
})

// login
const login = asyncHandler(async (req, res) => {

    // loading data from request
    // `identifier` is a username or an email; `email` / `userName` are still accepted for older clients
    const { identifier, userName, email, password } = req.body
    const loginId = String(identifier ?? email ?? userName ?? "").trim().toLowerCase()

    // checks for data
    if (!loginId) {
        throw new apiError(400, "Username or email is required for login")
    }
    if (!password) {
        throw new apiError(400, "Password is required")
    }

    // finding user in database (both fields are stored lowercase)
    const user = await User.findOne(
        loginId.includes("@") ? { email: loginId } : { userName: loginId }
    )
    if (!user) {
        throw new apiError(404, "User not found")
    }

    // validating password and generating refresh and access token
    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new apiError(401, "Invalid credentials")
    }
    const tokens = await createSession(user, req)

    // loading loged in user data
    const logedInUser = await User.findById(user._id).select("-password -refreshToken -__v -createdAt -updatedAt -watchHistory")
    if (!logedInUser) {
        throw new apiError(500, "Something went wrong while logging in user")
    }

    // sending response
    return setAuthCookies(res.status(200), tokens).json(new apiResponse(200, { user: logedInUser }, "User logged in successfully"))
})

//logout
const logout = asyncHandler(async (req, res) => {
    // end this device's session only; other devices stay signed in
    if (req.sessionId) {
        await revokeSession(req.sessionId, req.user._id, "logout")
    }
    // tokens issued before sessions existed were stored on the user
    await User.updateOne({ _id: req.user._id }, { $unset: { refreshToken: 1 } })

    return clearAuthCookies(res.status(200)).json(new apiResponse(200, null, "User logged out successfully"))
})

//refresh access token
const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.headers.authorization?.split(" ")[1]
    if (!incomingRefreshToken) {
        throw new apiError(401, "Refresh token is required")
    }

    // rotates the refresh token (the old one stops working) and detects reuse of a stolen token
    const tokens = await rotateSession(incomingRefreshToken, req)
    return setAuthCookies(res.status(200), tokens).json(new apiResponse(200, { accessToken: tokens.accessToken }, "Access token refreshed successfully"))
})


// change current password
const changeCurrentPassword = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
    const { currentPassword, newPassword } = req.body
    if (!user) {
        throw new apiError(404, "User not found")
    }
    if (!await user.isPasswordCorrect(currentPassword)) {
        throw new apiError(401, "Invalid current password")
    }
    if (currentPassword === newPassword) {
        throw new apiError(409, "New password cannot be same as current password")
    }
    if (!newPassword) {
        throw new apiError(400, "New password is required")
    }
    user.password = newPassword
    await user.save({ validateBeforeSave: false })
    // a changed password must sign out every other device (this one stays signed in)
    await revokeOtherSessions(user._id, req.sessionId, "password-change")
    await User.updateOne({ _id: user._id }, { $unset: { refreshToken: 1 } })
    return res.status(200).json(new apiResponse(200, null, "Password changed successfully"))
})


// replace a user image (avatar / cover): upload new -> save url -> delete old
// the old asset is only deleted after the new url is saved, so a failure never leaves the user without an image
const replaceUserImage = async (userId, localPath, fileType, urlField) => {
    const user = await User.findById(userId)
    if (!user) {
        deleteLocalFile(localPath)
        throw new apiError(404, "User not found")
    }

    const uploaded = await uploadOnCloudinary(localPath, fileType)
    if (!uploaded) {
        throw new apiError(500, "something went wrong while uploading")
    }

    let updatedUser
    try {
        updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { [urlField]: uploaded.url } },
            { new: true, select: "-password -refreshToken" }
        )
    } catch (error) {
        await deleteFromCloudinary(uploaded.public_id)
        throw new apiError(500, "something went wrong while saving the image")
    }

    const oldUrl = user[urlField]
    if (oldUrl) {
        await deleteFromCloudinary(extractPublicId(oldUrl))
    }
    return updatedUser
}

// change avatar
const changeAvatar = asyncHandler(async (req, res) => {
    const avatarLocal = req.files?.avatar?.[0]?.path
    if (!avatarLocal) {
        throw new apiError(400, "Avatar is required")
    }
    const updatedUser = await replaceUserImage(req.user._id, avatarLocal, "avatar", "avatarUrl")
    return res.status(200).json(new apiResponse(200, { updatedUser }, "Avatar changed successfully"))
})

// change cover
const changeCover = asyncHandler(async (req, res) => {
    const coverLocal = req.files?.cover?.[0]?.path
    if (!coverLocal) {
        throw new apiError(400, "Cover is required")
    }
    const updatedUser = await replaceUserImage(req.user._id, coverLocal, "cover", "coverImageUrl")
    return res.status(200).json(new apiResponse(200, { updatedUser }, "Cover changed successfully"))
})


// change Account details
const updateAccountDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
    const newUserName = req.body.userName
    const newFullName = req.body.fullName
    if (!user) {
        throw new apiError(404, "User not found")
    }
    if (!newFullName && !newUserName) {
        throw new apiError(400, "New fullname or New username is requrire to change")
    }
    if ((newFullName && newFullName === user?.fullName) || (newUserName && newUserName === user?.userName)) {
        throw new apiError(409, "New username or fullname can't be same as current")
    }
    if (newUserName) {
        const existedUser = await User.findOne({ userName: newUserName })
        if (existedUser) {
            throw new apiError(409, "User with this username already exists")
        }
    }
    const update = {}
    if (newFullName) update.fullName = newFullName
    if (newUserName) update.userName = newUserName
    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: update },
        { new: true, runValidators: true, context: 'query', select: 'userName fullName' }
    )
    return res.status(200).json(new apiResponse(200, { userName: updatedUser.userName, fullName: updatedUser.fullName }, "User Details Updated Successfully"))
})


// get current user
const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(new apiResponse(200, req.user, "Current User Details"))
})

export { registerUser, login, refreshAccessToken, logout, changeCurrentPassword, changeAvatar, changeCover, updateAccountDetails, getCurrentUser, checkUserNameAvailability }