import asyncHandler from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Like } from "../models/like.model.js";
import mongoose from "mongoose";
import agenda from "../db/agendaSetup.js";

const toggleReaction = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid target id");
    }

    const targetId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const targetType = req.body.targetType;
    let isLike = req.body.isLike;

    if (!["Video", "Tweet", "Comment"].includes(targetType)) {
        throw new apiError(400, "Invalid target type");
    }

    if (typeof isLike === "string") {
        if (isLike.toLowerCase() === "true") {
            isLike = true;
        } else if (isLike.toLowerCase() === "false") {
            isLike = false;
        } else {
            throw new apiError(400, "isLike must be true or false");
        }
    }

    try {
        const reaction = await Like.findOneAndUpdate(
            { userId: req.user._id, targetId, targetType },
            {
                $setOnInsert: { userId: req.user._id, targetId, targetType },
                $set: { isLike }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const isNew = reaction.createdAt.getTime() === reaction.updatedAt.getTime();
        if (isNew) {
            await agenda.schedule("in 10 minutes", "validate like", { likeId: reaction._id });
        }

        return res
            .status(201)
            .json(new apiResponse(201, reaction, isLike ? "Liked" : "Disliked"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while updating reaction");
    }
});

const likeCount = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid target id");
    }
    const targetId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const targetType = req.query.targetType;
    if (!["Video", "Tweet", "Comment"].includes(targetType)) {
        throw new apiError(400, "Invalid target type");
    }
    try {
        const likes = await Like.countDocuments({ targetId, targetType, isLike: true });
        return res
            .status(200)
            .json(new apiResponse(200, { likes }, "Like count fetched"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while fetching like count");
    }
})

const getReaction = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid target id");
    }
    const targetId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const targetType = req.query.targetType;
    if (!["Video", "Tweet", "Comment"].includes(targetType)) {
        throw new apiError(400, "Invalid target type");
    }
    try {
        const isLiked = await Like.findOne({ userId: req.user._id, targetId, targetType });
        let status = "none";
        if (isLiked) {
            status = isLiked.isLike ? "like" : "dislike";
        }
        return res
            .status(200)
            .json(new apiResponse(200, { status }, "reaction fetched"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while fetching reaction status");
    }
})

export { toggleReaction, likeCount, getReaction };

// next update : add remove reaction