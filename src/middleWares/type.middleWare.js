import { apiError } from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
export const determineOrigin = asyncHandler(
    (req,res,next) => {
        const isVideo = req.originalUrl.includes("/videos/");
        const isTweet = req.originalUrl.includes("/tweets/");
        const isSave = req.originalUrl.includes("/save/");
        const isPlaylist = req.originalUrl.includes("/playlists/");
        
        if ((!isVideo && !isTweet) || (!isSave && !isPlaylist)) {
            throw new apiError(400, "Invalid type of request");
        }
        if(isVideo){
            if(isSave || isPlaylist){
                req.type = isPlaylist ? "playlist" : "save"
            }else{
                req.type = "video"
            }
        }else {
            req.type = "tweet"
        }
            
        next()
    }
)