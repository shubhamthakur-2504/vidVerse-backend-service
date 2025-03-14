import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {apiError} from "../utils/apiError.js";
import {User} from "../models/user.model.js"
import mongoose from "mongoose";

const getUserChannelDetails = asyncHandler(async (req, res) => {
    
    const channelDetails = await User.aggregate([
        {
            $match: {
                _id: req.user?._id //new mongoose.ObjectId(req.user?._id) gives error as it is already objectId of mongo
            }
        },
        {
            $lookup:{
                from:"Subscribe",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"Subscribe",
                localField:"_id",
                foreignField:"subscriber",
                as:"Mysubscriptions"
            }
        },
        {
            $addFields:{
                subscribersCount:{$size:"$subscribers"},
                subscriptionsCount:{$size:"$Mysubscriptions"}
            }
        },
        {
            $project:{
                userName:1,
                subscribersCount:1,
                subscriptionsCount:1
            }
        }
    ])

    if (channelDetails.length === 0) {
        throw new apiError(500, "Something went wrong while fetching channel details")
    }

    return res.status(200).json(new apiResponse(200, channelDetails[0], "channel details fetched successfully"))
})


const getWatchHistory = asyncHandler(async (req, res) => {
    const watchHistory = await User.aggregate([
        {
            $match: {
                _id: req.user?._id
            }
        },
        {
            $lookup: {
                from: "Video",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup:{
                            from:"User",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner"
                        },
                    },
                    {
                        $unwind:"$owner"
                    },
                    {
                        $addFields:{
                            createdAtDiff:{
                                $let:{
                                    vars:{
                                        dayDiff:{
                                            $dateDiff:{
                                                startDate:"$createdAt",
                                                endDate:new Date(),
                                                unit:"day"
                                            }
                                        },
                                        monthDiff:{
                                            $dateDiff:{
                                                startDate:"$createdAt",
                                                endDate:new Date(),
                                                unit:"month"
                                            }
                                        },
                                        yearDiff:{
                                            $dateDiff:{
                                                startDate:"$createdAt",
                                                endDate:new Date(),
                                                unit:"year"
                                            }
                                        }
                                    },
                                    in:{
                                        days:"$$dayDiff",
                                        months:"$$monthDiff",
                                        years:"$$yearDiff"
                                    }
                                }
                            }
                        }
                    },
                    {
                        $project:{
                            videoFileUrl:1,
                            thumbnailUrl:1,
                            title:1,
                            views:1,
                            duration:1,
                            isPublished:1,
                            createdAt:1,
                            createdAtDiff:1,
                            owner:{
                                userName:1,
                                avatarUrl:1
                            }
                        }
                    }
                ]
            },
            
        }
    ])

    if (!watchHistory.length) {
        // If user is not found in DB, return 401 (unauthorized)
        return res.status(401).json(new apiResponse(401, null, "User session invalid. Please log in again."));
    }

    watchHistory.forEach( video =>{
        video.watchHistory.forEach( videoDetail => {
            const { days, months, years } = videoDetail.createdAtDiff
            
            let relativeTime = ''

            if (years > 0){
                relativeTime = `${years} year${years > 1 ? 's' : ''} ago`
            } else if (months > 0){
                relativeTime = `${months} month${months > 1 ? 's' : ''} ago`
            } else if (days > 0){
                relativeTime = `${days} days${days > 1 ? 's' : ''} ago`
            } else {
                relativeTime = 'Today'
            }

            videoDetail.relativeTime = relativeTime

            delete videoDetail.createdAtDiff
        })
    })

    return res.status(200).json(new apiResponse(200, watchHistory[0].watchHistory, "watch history fetched successfully")) //watchHistory[0] testing 
})








export {getUserChannelDetails, getWatchHistory}



// need to add checks so the follow and unfollow api can work