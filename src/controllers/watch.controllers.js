import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { getCreatedAtDiffField, formatRelativeTime } from "../utils/utils.js";

const OWNER_FIELDS = { _id: 1, userName: 1, fullName: 1, avatarUrl: 1 };

// reaction counts for a target in one lookup: [{ _id: true, n }, { _id: false, n }]
export const reactionCountsLookup = (targetType, as) => ({
    $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "targetId",
        pipeline: [{ $match: { targetType } }, { $group: { _id: "$isLike", n: { $sum: 1 } } }],
        as,
    },
});

// the viewer's own reaction on a target (empty for anonymous viewers)
export const viewerReactionLookup = (targetType, viewerId, as) => ({
    $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "targetId",
        pipeline: [{ $match: { targetType, userId: viewerId ?? null } }, { $project: { isLike: 1 } }],
        as,
    },
});

export const countFrom = (groups, isLike) => groups.find((g) => g._id === isLike)?.n ?? 0;
export const reactionOf = (docs) => (docs.length ? (docs[0].isLike ? "like" : "dislike") : null);

// everything the watch page needs in one round trip: the video, its owner, counts and the viewer's state
const getWatchPayload = asyncHandler(async (req, res) => {
    const videoId = mongoose.Types.ObjectId.createFromHexString(req.params.videoId);
    const viewerId = req.user?._id ?? null;

    const [video] = await Video.aggregate([
        // owners can also open their own unpublished (but processed) videos
        { $match: { _id: videoId, status: "ready", $or: [{ isPublished: true }, ...(viewerId ? [{ owner: viewerId }] : [])] } },
        { $lookup: { from: "users", localField: "owner", foreignField: "_id", pipeline: [{ $project: OWNER_FIELDS }], as: "owner" } },
        { $unwind: "$owner" },
        reactionCountsLookup("Video", "reactionCounts"),
        viewerReactionLookup("Video", viewerId, "viewerReaction"),
        { $lookup: { from: "comments", localField: "_id", foreignField: "videoId", pipeline: [{ $count: "n" }], as: "commentCount" } },
        { $lookup: { from: "subscribes", localField: "owner._id", foreignField: "channel", pipeline: [{ $count: "n" }], as: "subscriberCount" } },
        {
            $lookup: {
                from: "subscribes",
                localField: "owner._id",
                foreignField: "channel",
                pipeline: [{ $match: { subscriber: viewerId } }, { $limit: 1 }, { $project: { _id: 1 } }],
                as: "viewerSubscription",
            },
        },
        getCreatedAtDiffField(),
    ]);

    if (!video) throw new apiError(404, "Video not found");

    const payload = {
        _id: video._id,
        title: video.title,
        description: video.description,
        videoFileUrl: video.videoFileUrl,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        views: video.views,
        category: video.category,
        isPublished: video.isPublished,
        createdAt: video.createdAt,
        relativeTime: formatRelativeTime(video.createdAtDiff),
        owner: { ...video.owner, subscribersCount: video.subscriberCount[0]?.n ?? 0 },
        stats: {
            likes: countFrom(video.reactionCounts, true),
            dislikes: countFrom(video.reactionCounts, false),
            comments: video.commentCount[0]?.n ?? 0,
        },
        viewer: {
            reaction: reactionOf(video.viewerReaction),
            isSubscribed: video.viewerSubscription.length > 0,
            isOwner: Boolean(viewerId?.equals(video.owner._id)),
        },
    };
    return res.status(200).json(new apiResponse(200, payload, "Video fetched successfully"));
});

// "up next": same category or same creator ranked by views, topped up with the newest other videos
const getRelatedVideos = asyncHandler(async (req, res) => {
    const videoId = mongoose.Types.ObjectId.createFromHexString(req.params.videoId);
    const limit = req.query.limit;
    const current = await Video.findById(videoId).select("category owner").lean();
    if (!current) throw new apiError(404, "Video not found");

    const publicVideo = { isPublished: true, status: "ready", _id: { $ne: videoId } };
    const listStages = (match, sort, size) => [
        { $match: match },
        { $sort: sort },
        { $limit: size },
        { $lookup: { from: "users", localField: "owner", foreignField: "_id", pipeline: [{ $project: OWNER_FIELDS }], as: "owner" } },
        { $unwind: "$owner" },
        { $project: { title: 1, thumbnailUrl: 1, duration: 1, views: 1, category: 1, createdAt: 1, owner: 1 } },
    ];

    const related = await Video.aggregate(listStages({ ...publicVideo, $or: [{ category: current.category }, { owner: current.owner }] }, { views: -1, createdAt: -1 }, limit));
    let items = related;
    if (items.length < limit) {
        const seen = [videoId, ...items.map((v) => v._id)];
        const filler = await Video.aggregate(listStages({ ...publicVideo, _id: { $nin: seen } }, { createdAt: -1, _id: -1 }, limit - items.length));
        items = [...items, ...filler];
    }
    return res.status(200).json(new apiResponse(200, items, "Related videos fetched successfully"));
});

export { getWatchPayload, getRelatedVideos };
