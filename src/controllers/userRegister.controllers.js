import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {apiError} from "../utils/apiError.js";
import {User} from "../models/user.model.js"
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import JWT from "jsonwebtoken"

// common function
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

//generate refresh and access token
const  generateRefreshAndAccessToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        
        if(!user){
            throw new apiError(404,"User not found")
        }
        const refreshToken = await user.generateRefreshToken()
        const accessToken = await user.generateAccessToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave:false})      
        
        return {refreshToken,accessToken}
    } catch (error) {
        return new apiError(500,"Something went wrong while generating refresh and access token")
    }
}

// generate access token
const generateAccessToken = async (user) => {
    try {
        if(!user) return null
        const accessToken = await user.generateAccessToken()
        return accessToken
    } catch (error) {
        throw apiError(500,"Something went wrong while generating access token")
    }
}

// register
const registerUser = asyncHandler(async (req, res) => {
    
    const {userName,email,password,fullName} = req.body
    const avatarLocal = req.files?.avatar?.[0]?.path
    const coverLocal = req.files?.cover?.[0]?.path
    
    //validation code here
    if(!userName || !email || !password || !fullName || !avatarLocal || !coverLocal){
        throw new apiError(400,"All fields are required")
    }

    const existedUser = await User.findOne({
        $or:[{userName:userName},{email:email}]
    })

    if(existedUser){
        throw new apiError(409,"User already exists")
    }

    if (!validateEmail(email)) {
    throw new apiError(410, "Invalid email ");
    } 
    
    // upload on cloudinary
    const avatar = await uploadOnCloudinary(avatarLocal)
    const cover = await uploadOnCloudinary(coverLocal)
    

    // create user

    try {
        const user = await User.create({
            userName:userName,
            email:email,
            password:password,
            fullName:fullName,
            avatarUrl:avatar?.url,
            coverImageUrl:cover?.url
        })
        const createdUser =  await User.findById(user._id).select("-password -refreshToken")
        if(!createdUser){
            throw new apiError(500,"Something went wrong while registering user")
        }
    
        return res.status(201).json(new apiResponse(201,"User registered successfully",createdUser))
    } catch (error) {
        if(avatar?.public_id) await deleteFromCloudinary(avatar?.public_id)
        if(cover?.public_id) await deleteFromCloudinary(cover?.public_id)
        throw new apiError(500,"Something went wrong while registering user and images were deleted")
        
    }
})

// login
const login = asyncHandler(async (req,res) => {

    // loading data from request
    const {userName,email,password}=req.body    

    // checks for data
    if (!email && !userName) {
        throw new apiError(400,"Either Username or email require for Login")
    }
    if(!password){
        throw new apiError(400,"Password is required")
    }

    // finding user in database
    const user = await User.findOne({
        $or:[{userName:userName},{email:email}]
    })
    if(!user){
        throw new apiError(404,"User not found")
    }

    // validating password and generating refresh and access token
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new apiError(401,"Invalid credentials")
    }
    const {refreshToken,accessToken} = await generateRefreshAndAccessToken(user._id)

    // loading loged in user data
    const logedInUser = await User.findById(user._id).select("-password -refreshToken")
    if (!logedInUser) {
        throw new apiError(500,"Something went wrong while logging in user")
    }
    const option = {
        httpOnly:true,
        expires:new Date(Date.now()+process.env.JWT_COOKIE_EXPIRY*24*60*60*1000),
        // secure:process.env.NODE_ENV === "production",
        // sameSite:"none"
        secure: process.env.NODE_ENV === "production" ? true : false, // False for development
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax" // "lax" allows cookies in dev mode
    }    

    // sending response
    return res.status(200).cookie("accessToken",accessToken,option).cookie("refreshToken",refreshToken,option).json(new apiResponse(200,{user:logedInUser,accessToken,refreshToken},"User logged in successfully"))
    
    
})

//logout
const logout = asyncHandler(async (req,res) => {
    await User.findByIdAndUpdate(req.user._id,{
        $set:{refreshToken:undefined}
    },{new:true})
    const option = {
        httpOnly:true,
        secure:process.env.NODE_ENV === "production",
        sameSite:"none"
    }

    return res.status(200).clearCookie("accessToken",option).clearCookie("refreshToken",option).json(new apiResponse(200,"User logged out successfully"))
})

//refresh access token
const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.headers.authorization?.split(" ")[1]

    
    if(!incomingRefreshToken){
        throw new apiError(401,"Refresh token is required")
    }
    try {
        const decodedToken = JWT.verify(incomingRefreshToken,process.env.JWT_REFRESH_SECRET)
        const user = await User.findById(decodedToken?.id)

        if(!user){
            throw new apiError(401,"Invalid refresh token")
        }
        if(user?.refreshToken !== incomingRefreshToken){
            throw new apiError(401,"Invalid refresh token")
        }

        const accessToken = await generateAccessToken(user)
        const option = {
            httpOnly:true,
            expires:new Date(Date.now()+process.env.JWT_COOKIE_EXPIRY*24*60*60*1000),
            secure:process.env.NODE_ENV === "production",
            sameSite:"none"
        }

        return res.status(200).cookie("accessToken",accessToken,option).json(new apiResponse(200,{accessToken},"Access token refreshed successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while refreshing access token")
    }
})

export { registerUser, login, refreshAccessToken, logout }