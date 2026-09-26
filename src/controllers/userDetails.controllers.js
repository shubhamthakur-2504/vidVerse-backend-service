import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js";
import { getCreatedAtDiffField, formatRelativeTime } from "../utils/utils.js";


const getUserChannelDetails = asyncHandler(async (req, res) => {
    const userId = req.user._id
    // two indexed counts instead of $lookup-ing every subscription document just to take its size
    const [subscribersCount, subscriptionsCount] = await Promise.all([
        Subscription.countDocuments({ channel: userId }),
        Subscription.countDocuments({ subscriber: userId })
    ])

    return res.status(200).json(new apiResponse(200, {
        _id: userId,
        userName: req.user.userName,
        subscribersCount,
        subscriptionsCount
    }, "channel details fetched successfully"))
})


const getWatchHistory = asyncHandler(async (req, res) => {
    // unwind with the array index so the result keeps history order (most recent first);
    // a plain $lookup on the array would return videos in collection order
    const watchHistory = await User.aggregate([
        { $match: { _id: req.user._id } },
        { $project: { watchHistory: 1 } },
        { $unwind: { path: "$watchHistory", includeArrayIndex: "position" } },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "video",
                pipeline: [
                    { $match: { isPublished: true, status: "ready" } },
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner"
                        }
                    },
                    { $unwind: "$owner" },
                    getCreatedAtDiffField(),
                    {
                        $project: {
                            videoFileUrl: 1,
                            thumbnailUrl: 1,
                            title: 1,
                            views: 1,
                            duration: 1,
                            category: 1,
                            createdAt: 1,
                            createdAtDiff: 1,
                            owner: {
                                _id: 1,
                                userName: 1,
                                fullName: 1,
                                avatarUrl: 1
                            }
                        }
                    }
                ]
            }
        },
        // videos deleted or unpublished since they were watched drop out here
        { $unwind: "$video" },
        { $sort: { position: 1 } },
        { $replaceRoot: { newRoot: "$video" } }
    ])

    watchHistory.forEach(video => {
        video.relativeTime = formatRelativeTime(video.createdAtDiff)
        delete video.createdAtDiff
    })

    return res.status(200).json(new apiResponse(200, watchHistory, "watch history fetched successfully"))
})








export {getUserChannelDetails, getWatchHistory}



// need to add checks so the follow and unfollow api can work