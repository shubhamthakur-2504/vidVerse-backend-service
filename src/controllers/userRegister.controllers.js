import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js"
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js"
import { extractPublicId } from "../utils/utils.js";
import JWT from "jsonwebtoken"
import fs from "fs"

// common function
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}
// cookie options shared by login, refresh and logout so set-cookie and clear-cookie always match
// (browsers reject SameSite=None without Secure, so dev uses Lax)
function authCookieOptions({ withExpiry = true } = {}) {
    const isProduction = process.env.NODE_ENV === "production"
    const options = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax"
    }
    if (withExpiry) {
        options.expires = new Date(Date.now() + Number(process.env.JWT_COOKIE_EXPIRY) * 24 * 60 * 60 * 1000)
    }
    return options
}
function deleteLocalFile(filePath) {
    try {
        fs.unlinkSync(filePath)
        console.log("File deleted from local")
    } catch (error) {
        console.log(error)
    }
}

//generate refresh and access token
const generateRefreshAndAccessToken = async (userId) => {
    const user = await User.findById(userId)
    if (!user) {
        throw new apiError(404, "User not found")
    }
    try {
        // generateRefreshToken also stores the token on the user and saves it
        const refreshToken = await user.generateRefreshToken()
        const accessToken = user.generateAccessToken()
        return { refreshToken, accessToken }
    } catch (error) {
        // must throw, not return: callers destructure the result
        throw new apiError(500, "Something went wrong while generating refresh and access token")
    }
}

// generate access token
const generateAccessToken = async (user) => {
    try {
        if (!user) return null
        const accessToken = await user.generateAccessToken()
        return accessToken
    } catch (error) {
        throw new apiError(500, "Something went wrong while generating access token")
    }
}

// register
const registerUser = asyncHandler(async (req, res) => {

    const { userName, email, password, fullName } = req.body
    const avatarLocal = req.files?.avatar?.[0]?.path
    const coverLocal = req.files?.cover?.[0]?.path

    //validation code here
    if (!userName || !email || !password || !fullName || !avatarLocal || !coverLocal) {
        if (avatarLocal) deleteLocalFile(avatarLocal)
        if (coverLocal) deleteLocalFile(coverLocal)
        throw new apiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ userName: userName }, { email: email }]
    })

    if (existedUser) {
        if (avatarLocal) deleteLocalFile(avatarLocal)
        if (coverLocal) deleteLocalFile(coverLocal)
        throw new apiError(409, "User already exists")
    }

    if (!validateEmail(email)) {
        if (avatarLocal) deleteLocalFile(avatarLocal)
        if (coverLocal) deleteLocalFile(coverLocal)
        throw new apiError(410, "Invalid email ");
    }

    // upload on cloudinary
    const avatar = await uploadOnCloudinary(avatarLocal, "avatar")
    const cover = await uploadOnCloudinary(coverLocal, "cover")


    // create user

    try {
        const user = await User.create({
            userName: userName,
            email: email,
            password: password,
            fullName: fullName,
            avatarUrl: avatar?.url,
            coverImageUrl: cover?.url
        })
        const createdUser = await User.findById(user._id).select("-password -refreshToken -__v -createdAt -updatedAt -watchHistory")
        if (!createdUser) {
            throw new apiError(500, "Something went wrong while registering user")
        }

        return res.status(201).json(new apiResponse(201, createdUser, "User registered successfully"))
    } catch (error) {
        if (avatar?.public_id) await deleteFromCloudinary(avatar?.public_id)
        if (cover?.public_id) await deleteFromCloudinary(cover?.public_id)
        if (avatarLocal) deleteLocalFile(avatarLocal)
        if (coverLocal) deleteLocalFile(coverLocal)
        throw new apiError(500, "Something went wrong while registering user and images were deleted")

    }
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
    const { refreshToken, accessToken } = await generateRefreshAndAccessToken(user._id)

    // loading loged in user data
    const logedInUser = await User.findById(user._id).select("-password -refreshToken -__v -createdAt -updatedAt -watchHistory")
    if (!logedInUser) {
        throw new apiError(500, "Something went wrong while logging in user")
    }
    const option = authCookieOptions()

    // sending response
    return res.status(200).cookie("accessToken", accessToken, option).cookie("refreshToken", refreshToken, option).json(new apiResponse(200, { user: logedInUser }, "User logged in successfully"))


})

//logout
const logout = asyncHandler(async (req, res) => {
    // $unset, not $set: undefined — Mongoose strips undefined values, which left the token valid
    await User.findByIdAndUpdate(req.user._id, {
        $unset: { refreshToken: 1 }
    })
    const option = authCookieOptions({ withExpiry: false })

    return res.status(200).clearCookie("accessToken", option).clearCookie("refreshToken", option).json(new apiResponse(200, null, "User logged out successfully"))
})

//refresh access token
const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.headers.authorization?.split(" ")[1]


    if (!incomingRefreshToken) {
        throw new apiError(401, "Refresh token is required")
    }
    try {
        const decodedToken = JWT.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET)
        const user = await User.findById(decodedToken?.id)

        if (!user) {
            throw new apiError(401, "Invalid refresh token")
        }
        if (user?.refreshToken !== incomingRefreshToken) {
            throw new apiError(401, "Invalid refresh token")
        }

        const accessToken = await generateAccessToken(user)
        const option = authCookieOptions()

        return res.status(200).cookie("accessToken", accessToken, option).json(new apiResponse(200, { accessToken }, "Access token refreshed successfully"))
    } catch (error) {
        if (error instanceof apiError) throw error
        // expired / malformed / wrongly signed token: the client must log in again
        if (error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError") {
            throw new apiError(401, "Invalid or expired refresh token")
        }
        throw new apiError(500, "Something went wrong while refreshing access token")
    }
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

export { registerUser, login, refreshAccessToken, logout, changeCurrentPassword, changeAvatar, changeCover, updateAccountDetails, getCurrentUser }