import { apiError } from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
export const determineOrigin = asyncHandler(
    (req,res,next) => {
        const isVideo = req.originalUrl.includes("/videos/");
        const isTweet = req.originalUrl.includes("/tweets/");
        const isUserPlaylist = req.originalUrl.includes("/userplaylist/");
        const isCreaterPlaylist = req.originalUrl.includes("/creatorplaylist/");
        
        if (!isVideo && !isTweet && !isUserPlaylist && !isCreaterPlaylist) {
            throw new apiError(400, "Invalid type of request");
        }
        if(isVideo){
            if(isUserPlaylist || isCreaterPlaylist){
                req.type = isCreaterPlaylist ? "creatorplaylist" : "userplaylist"
            }else{
                req.type = "video"
            }
        }else {
            req.type = "tweet"
        }
            
        next()
    }
)