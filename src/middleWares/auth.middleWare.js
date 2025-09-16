import JWT from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import  asyncHandler  from "../utils/asyncHandler.js";

export const verifyJwtToken = asyncHandler(async (req,_, next) => {
    const token = req.headers.authorization?.split(" ")[1] || req.cookies.accessToken
    
    if (!token){
        throw new apiError(401,"Access token is required")
    }
    try {
        const decodedToken = JWT.verify(token, process.env.JWT_ACCESS_SECRET);    
        const user  = await User.findById(decodedToken?.id).select("-password -refreshToken")
        
        if(!user){
            throw new apiError(401,"Invalid access token")
        }
        req.user = user
        next()
    } catch (error) {
        throw new apiError(401,error?.message || "Invalid access token")
    }
})

export const lightVerifyJwtToken = asyncHandler(async (req,_, next) => {
    const token = req.headers.authorization?.split(" ")[1] || req.cookies.accessToken
    
    if (!token){
        req.user = null
        next()
    }
    try {
        const decodedToken = JWT.verify(token, process.env.JWT_ACCESS_SECRET);    
        const user  = await User.findById(decodedToken?.id).select("-password -refreshToken")
        
        if(!user){
            req.user = null
            next()
        }
        req.user = user
        next()
    } catch (error) {
        req.user = null
        next()
    }
})
