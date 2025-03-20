import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Tweet } from "../models/tweet.model.js";
import { getCreatedAtDiffField, formatRelativeTime, extractPublicId, isEdited, canEdit } from "../utils/utils.js";
import { uploadOnCloudinary,deleteFromCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";

const createTweet = asyncHandler(async (req, res) => {
    const {content} = req.body
    const imageLocal = req.file?.path || null

    if (!content) {
        throw new apiError(400,"Content is required")
    }
    
    let image = null;
    if (imageLocal){
        image = await uploadOnCloudinary(imageLocal,"image")
    }

    
    try {
        const tweet = await Tweet.create({
            content : content,
            image : image.url,
            owner : req.user._id
        })
        
        if (!tweet) {
            throw new apiError(500,"Something went wrong while creating tweet")
        }

        res.status(200).json(new apiResponse(200,tweet,"Tweet created successfully"))

    } catch (error) {
        if (imageLocal) {
            await deleteFromCloudinary(image.public_id)
        }
        throw new apiError(500,"Something went wrong failed to create tweet")
    }
})

const deleteTweet = asyncHandler(async (req, res) => {
    const tweetId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const tweet = await Tweet.findById(tweetId)
    if(!tweet){
        throw new apiError(404,"Tweet not found")
    }
    if(!tweet.owner.equals(req.user._id)){
        throw new apiError(403,"Unauthorized to delete this tweet")
    }
    try {
        if (tweet.image) {
            await deleteFromCloudinary(extractPublicId(tweet.image))
        }
    } catch (error) {
        throw new apiError(500,"Something went wrong while deleting image in tweet")
    }
    try {
        const deletedTweet = await Tweet.findByIdAndDelete(tweetId)
        if(!deletedTweet){
            throw new apiError(500,"Something went wrong while deleting tweet")
        }
        res.status(200).json(new apiResponse(200,"Tweet deleted successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while deleting tweet")
    }
})

const getAllTweets = asyncHandler(async (req, res) => {
    try {
        const tweets = await Tweet.aggregate([
            {
                $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner"
                }
            },
            {
                $unwind: "$owner"
            },
            getCreatedAtDiffField(),
            {
                $project: {
                    content: 1,
                    image:1,
                    createdAtDiff: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    "owner.userName": 1,
                    "owner.avatarUrl": 1,
                }
            },
        ])
        const formattedTweets = tweets.map((tweet) => {
            return {
                ...tweet,
                isEdited: isEdited(tweet.createdAt, tweet.updatedAt),
                createdAt: formatRelativeTime(tweet.createdAt)
            }
        })
        res.status(200).json(new apiResponse(200,formattedTweets,"Tweets fetched successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while fetching tweets")
    }
})


const getTweetDetails = asyncHandler(async (req, res) => {
    const tweetId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    try {
        const tweet = await Tweet.aggregate([
            {
                $match: {
                    _id: tweetId
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner"
                }
            },
            {
                $unwind: "$owner"
            },
            getCreatedAtDiffField(),
            {
                $project: {
                    content: 1,
                    image:1,
                    createdAtDiff: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    "owner.userName": 1,
                    "owner.avatarUrl": 1,
                }
            },
        ])
        if (!tweet.length) {
            throw new apiError(404,"Tweet not found")
        }
        
        tweet[0].isEdited = isEdited(tweet[0].createdAt, tweet[0].updatedAt)
        tweet[0].createdAt = formatRelativeTime(tweet[0].createdAt)
        delete tweet[0].updatedAt
        res.status(200).json(new apiResponse(200,tweet[0],"Tweet fetched successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while fetching tweet")
    }
})


const updateTweet = asyncHandler(async (req, res) => {
    const tweetId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const tweet = await Tweet.findById(tweetId)
    if(!tweet){
        throw new apiError(404,"Tweet not found")
    }
    if(!canEdit(tweet.createdAt)){
        throw new apiError(400,"This tweet can not be edited")
    }
    try {
        const content = req.body.content
        if (!content || content.trim().length === 0) {
            throw new apiError(400, "Content cannot be empty");
        }        
        tweet.content = content
        await tweet.save({validateBeforeSave:false})
        res.status(200).json(new apiResponse(200,tweet,"Tweet updated successfully1"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while updating tweet")
    }
})

export {createTweet, deleteTweet, updateTweet, getAllTweets, getTweetDetails}