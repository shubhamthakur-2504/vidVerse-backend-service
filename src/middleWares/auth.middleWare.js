import JWT from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import  asyncHandler  from "../utils/asyncHandler.js";
import { config } from "../config.js";

export const verifyJwtToken = asyncHandler(async (req,_, next) => {
    const token = req.headers.authorization?.split(" ")[1] || req.cookies.accessToken
    
    if (!token){
        throw new apiError(401,"Access token is required")
    }
    try {
        const decodedToken = JWT.verify(token, config.jwt.accessSecret);    
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
        return next()
    }
    let user = null
    try {
        const decodedToken = JWT.verify(token, config.jwt.accessSecret);
        user = await User.findById(decodedToken?.id).select("-password -refreshToken")
    } catch (error) {
        user = null
    }
    // next() stays outside the try so errors thrown further down the chain are not swallowed or re-run
    req.user = user || null
    return next()
})
