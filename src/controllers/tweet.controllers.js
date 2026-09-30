import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Tweet } from "../models/tweet.model.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { removeNotificationsFor } from "../services/notification.service.js";
import { getCreatedAtDiffField, formatRelativeTime, extractPublicId, isEdited, canEdit } from "../utils/utils.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";
import { NEWEST_FIRST, afterCursor, decodeCursor, pageOf } from "../utils/pagination.js";

const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body;
    const imageLocal = req.file?.path || null;

    if (!content) {
        throw new apiError(400, "Content is required");
    }

    let image = null;
    if (imageLocal) {
        image = await uploadOnCloudinary(imageLocal, "image");
        if (!image) {
            throw new apiError(500, "Something went wrong while uploading image");
        }
    }

    try {
        const tweet = await Tweet.create({
            content: content,
            image: image?.url,
            owner: req.user._id,
        });

        if (!tweet) {
            throw new apiError(500, "Something went wrong while creating tweet");
        }

        res.status(200).json(new apiResponse(200, tweet, "Tweet created successfully"));
    } catch (error) {
        if (image?.public_id) {
            await deleteFromCloudinary(image.public_id);
        }
        throw new apiError(500, "Something went wrong failed to create tweet");
    }
});

const deleteTweet = asyncHandler(async (req, res) => {
    const tweetId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new apiError(404, "Tweet not found");
    }
    if (!tweet.owner.equals(req.user._id)) {
        throw new apiError(403, "Unauthorized to delete this tweet");
    }
    try {
        if (tweet.image) {
            await deleteFromCloudinary(extractPublicId(tweet.image));
        }
    } catch (error) {
        throw new apiError(500, "Something went wrong while deleting image in tweet");
    }
    try {
        const deletedTweet = await Tweet.findByIdAndDelete(tweetId);
        if (!deletedTweet) {
            throw new apiError(500, "Something went wrong while deleting tweet");
        }
        // the post's comments and every reaction on the post or its comments go with it
        const commentIds = await Comment.find({ tweetId }).distinct("_id");
        await Promise.all([
            Like.deleteMany({ targetType: "Tweet", targetId: tweetId }),
            Like.deleteMany({ targetType: "Comment", targetId: { $in: commentIds } }),
            Comment.deleteMany({ tweetId }),
            removeNotificationsFor({ post: tweetId }),
        ]);
        res.status(200).json(new apiResponse(200, { _id: tweetId }, "Tweet deleted successfully"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while deleting tweet");
    }
});

const getAllTweets = asyncHandler(async (req, res) => {
    const cursor = decodeCursor(req.query.cursor);
    const { limit } = req.query;
    try {
        // newest first, one page at a time (limit + 1 tells whether another page exists)
        const tweets = await Tweet.aggregate([
            { $match: afterCursor(cursor) },
            { $sort: NEWEST_FIRST },
            { $limit: limit + 1 },
            {
                $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner",
                },
            },
            {
                $unwind: "$owner",
            },
            getCreatedAtDiffField(),
            {
                $project: {
                    content: 1,
                    image: 1,
                    createdAtDiff: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    "owner.userName": 1,
                    "owner.avatarUrl": 1,
                },
            },
        ]);
        // formatRelativeTime takes the { days, months, years } diff computed in the pipeline, not a Date
        const page = pageOf(tweets, limit);
        page.items = page.items.map(({ createdAtDiff, ...tweet }) => {
            return {
                ...tweet,
                isEdited: isEdited(tweet.createdAt, tweet.updatedAt),
                relativeTime: formatRelativeTime(createdAtDiff),
            };
        });
        res.status(200).json(new apiResponse(200, page, "Tweets fetched successfully"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while fetching tweets");
    }
});

const getTweetDetails = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid tweet id");
    }
    const tweetId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    try {
        const tweet = await Tweet.aggregate([
            {
                $match: {
                    _id: tweetId,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner",
                },
            },
            {
                $unwind: "$owner",
            },
            getCreatedAtDiffField(),
            {
                $project: {
                    content: 1,
                    image: 1,
                    createdAtDiff: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    "owner.userName": 1,
                    "owner.avatarUrl": 1,
                },
            },
        ]);
        if (!tweet.length) {
            throw new apiError(404, "Tweet not found");
        }

        tweet[0].isEdited = isEdited(tweet[0].createdAt, tweet[0].updatedAt);
        tweet[0].relativeTime = formatRelativeTime(tweet[0].createdAtDiff);
        delete tweet[0].createdAtDiff;
        delete tweet[0].updatedAt;
        res.status(200).json(new apiResponse(200, tweet[0], "Tweet fetched successfully"));
    } catch (error) {
        if (error instanceof apiError) throw error;
        throw new apiError(500, "Something went wrong while fetching tweet");
    }
});

const updateTweet = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid tweet id");
    }
    const tweetId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new apiError(404, "Tweet not found");
    }
    if (!tweet.owner.equals(req.user._id)) {
        throw new apiError(403, "Unauthorized to edit this tweet");
    }
    if (!canEdit(tweet.createdAt)) {
        throw new apiError(400, "This tweet can not be edited");
    }
    const content = req.body.content;
    if (!content || content.trim().length === 0) {
        throw new apiError(400, "Content cannot be empty");
    }
    try {
        tweet.content = content;
        await tweet.save({ validateBeforeSave: false });
        res.status(200).json(new apiResponse(200, tweet, "Tweet updated successfully1"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while updating tweet");
    }
});

export { createTweet, deleteTweet, updateTweet, getAllTweets, getTweetDetails };
