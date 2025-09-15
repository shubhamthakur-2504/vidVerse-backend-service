import asyncHandler from "../utils/asyncHandler";
import { apiError } from "../utils/apiError";
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
    const islike = req.body.islike; 

    if (!["Video", "Tweet", "Comment"].includes(targetType)) {
        throw new apiError(400, "Invalid target type");
    }
    if (typeof islike !== "boolean") {
        throw new apiError(400, "islike must be true or false");
    }

    try {
        const reaction = await Like.findOneAndUpdate(
            { userId: req.user._id, targetId, targetType },
            {
                $setOnInsert: { userId: req.user._id, targetId, targetType },
                $set: { islike }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        agenda.schedule("in 10 minutes", "validate like", { likeId: reaction._id });

        return res
            .status(201)
            .json(new apiResponse(201, reaction, islike ? "Liked" : "Disliked"));
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
        const likes = await Like.countDocuments({ targetId, targetType, islike: true });
        return res
            .status(200)
            .json(new apiResponse(200, { likes }, "Like count fetched"));
    }catch (error) {
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
        const isliked = await Like.findOne({ userId: req.user._id, targetId, targetType});
        let status = "none";
        if(isliked){
            status = isliked.islike ? "like" : "dislike";
        }
        return res
            .status(200)
            .json(new apiResponse(200, { status }, "reaction fetched"));
    }catch (error) {
        throw new apiError(500, "Something went wrong while fetching reaction status");
    }
})

export { toggleReaction, likeCount, getReaction };

// next update : add remove reaction