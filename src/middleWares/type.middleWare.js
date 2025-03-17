import { apiError } from "../utils/apiError";
import asyncHandler from "../utils/asyncHandler";
export const determineOrigin = asyncHandler(
    (req,res,next) => {
        const isVideo = req.originalUrl.includes("/videos/")
        const isTweet = req.originalUrl.includes("/tweets/");
        
        if (!isVideo && !isTweet) {
            throw new apiError(400, "Invalid type. Must be 'video' or 'tweet'")
        }
        req.type = isVideo ? "video" : "tweet"
        next()
    }
)