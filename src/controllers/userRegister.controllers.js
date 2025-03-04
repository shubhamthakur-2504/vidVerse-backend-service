import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {apiError} from "../utils/apiError.js";
import {User} from "../models/user.model.js"
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"

// common function
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
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

export { registerUser }