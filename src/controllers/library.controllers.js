import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { PlayList } from "../models/playList.model.js";

// Library (v2 only): watch history management and playlist reads for the library pages.

const OWNER_FIELDS = { _id: 1, userName: 1, fullName: 1, avatarUrl: 1 };

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

// GET /v2/playlists[?videoId=]: the signed-in user's playlists, most recently updated first.
// With videoId, each playlist says whether it already holds that video (the "save to playlist" dialog).
const getMyPlaylists = asyncHandler(async (req, res) => {
    const videoId = req.query.videoId ? mongoose.Types.ObjectId.createFromHexString(req.query.videoId) : null;
    const playlists = await PlayList.aggregate([
        { $match: { ownerId: req.user._id } },
        { $sort: { updatedAt: -1 } },
        {
            $project: {
                title: 1,
                description: 1,
                thumbnailUrl: 1,
                updatedAt: 1,
                videoCount: { $size: "$videos" },
                ...(videoId && { hasVideo: { $in: [videoId, "$videos"] } }),
            },
        },
    ]);
    return res.status(200).json(new apiResponse(200, playlists, "Playlists fetched successfully"));
});

// GET /v2/playlists/:id: public playlist page with its videos in playlist order.
// Videos that are not public drop out, except the viewer's own ready videos.
const getPlaylistWithVideos = asyncHandler(async (req, res) => {
    const playlistId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const viewerId = req.user?._id ?? null;
    const visible = viewerId
        ? { status: "ready", $or: [{ isPublished: true }, { owner: viewerId }] }
        : { status: "ready", isPublished: true };

    const [playlist] = await PlayList.aggregate([
        { $match: { _id: playlistId } },
        {
            $lookup: {
                from: "users",
                localField: "ownerId",
                foreignField: "_id",
                as: "owner",
                pipeline: [{ $project: OWNER_FIELDS }],
            },
        },
        { $unwind: "$owner" },
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "items",
                let: { ids: "$videos" },
                pipeline: [
                    { $match: visible },
                    { $addFields: { position: { $indexOfArray: ["$$ids", "$_id"] } } },
                    { $sort: { position: 1 } },
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [{ $project: OWNER_FIELDS }],
                        },
                    },
                    { $unwind: "$owner" },
                    { $project: { title: 1, thumbnailUrl: 1, duration: 1, views: 1, createdAt: 1, owner: 1 } },
                ],
            },
        },
        {
            $project: {
                title: 1,
                description: 1,
                thumbnailUrl: 1,
                createdAt: 1,
                updatedAt: 1,
                owner: 1,
                videos: "$items",
            },
        },
    ]);
    if (!playlist) throw new apiError(404, "Playlist not found");

    playlist.isOwner = Boolean(viewerId?.equals(playlist.owner._id));
    return res.status(200).json(new apiResponse(200, playlist, "Playlist fetched successfully"));
});

export { removeFromWatchHistory, clearWatchHistory, getMyPlaylists, getPlaylistWithVideos };
