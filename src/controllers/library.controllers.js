import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";

// Library (v2 only): watch history management.

// DELETE /v2/me/history/:videoId
const removeFromWatchHistory = asyncHandler(async (req, res) => {
    const videoId = mongoose.Types.ObjectId.createFromHexString(req.params.videoId);
    await User.updateOne({ _id: req.user._id }, { $pull: { watchHistory: videoId } });
    return res.status(204).end();
});

// DELETE /v2/me/history
const clearWatchHistory = asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $set: { watchHistory: [] } });
    return res.status(204).end();
});

export { removeFromWatchHistory, clearWatchHistory };
