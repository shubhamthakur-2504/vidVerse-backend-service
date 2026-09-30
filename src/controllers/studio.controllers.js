import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { Subscription } from "../models/subscription.model.js";
import agenda from "../db/agendaSetup.js";

// Creator studio: the signed-in user's own videos in every state, with basic stats.

const STUDIO_FIELDS = {
    title: 1,
    description: 1,
    category: 1,
    thumbnailUrl: 1,
    videoFileUrl: 1,
    duration: 1,
    views: 1,
    isPublished: 1,
    status: 1,
    createdAt: 1,
    updatedAt: 1,
};

// GET /v2/me/studio: totals plus every video with its like / comment counts, newest first
const getStudioOverview = asyncHandler(async (req, res) => {
    const ownerId = req.user._id;
    const [videos, subscribers] = await Promise.all([
        Video.aggregate([
            { $match: { owner: ownerId } },
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: "likes",
                    localField: "_id",
                    foreignField: "targetId",
                    pipeline: [{ $match: { targetType: "Video", isLike: true } }, { $count: "n" }],
                    as: "likeCount",
                },
            },
            {
                $lookup: {
                    from: "comments",
                    localField: "_id",
                    foreignField: "videoId",
                    pipeline: [{ $count: "n" }],
                    as: "commentCount",
                },
            },
            {
                $project: {
                    ...STUDIO_FIELDS,
                    likes: { $ifNull: [{ $first: "$likeCount.n" }, 0] },
                    comments: { $ifNull: [{ $first: "$commentCount.n" }, 0] },
                },
            },
        ]),
        Subscription.countDocuments({ channel: ownerId }),
    ]);

    const totals = videos.reduce(
        (sum, v) => ({
            videos: sum.videos + 1,
            views: sum.views + (v.views || 0),
            likes: sum.likes + v.likes,
            comments: sum.comments + v.comments,
        }),
        { videos: 0, views: 0, likes: 0, comments: 0 }
    );
    return res.status(200).json(
        new apiResponse(
            200,
            {
                totals: { ...totals, subscribers },
                processing: videos.filter((v) => v.status === "processing").length,
                videos,
            },
            "Studio overview fetched successfully"
        )
    );
});

const findOwnVideo = async (videoId, ownerId) => {
    const video = await Video.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(videoId), owner: ownerId })
        .select(STUDIO_FIELDS)
        .lean();
    if (!video) throw new apiError(404, "Video not found");
    return video;
};

// GET /v2/me/videos/:videoId: one of your videos in any status (edit page, upload status polling)
const getMyVideo = asyncHandler(async (req, res) => {
    const video = await findOwnVideo(req.params.videoId, req.user._id);
    return res.status(200).json(new apiResponse(200, video, "Video fetched successfully"));
});

// POST /v2/videos/:videoId/reprocess: retry a video whose processing failed (its original upload is kept on failure)
const reprocessVideo = asyncHandler(async (req, res) => {
    const video = await findOwnVideo(req.params.videoId, req.user._id);
    if (video.status !== "failed") {
        throw new apiError(409, `Only failed videos can be reprocessed (this one is ${video.status})`);
    }
    await Video.updateOne({ _id: video._id }, { $set: { status: "processing" } });
    await agenda.schedule("in 5 seconds", "process video chunks", { videoId: video._id, attempt: 1 });
    return res.status(202).json(new apiResponse(202, { _id: video._id, status: "processing" }, "Processing restarted"));
});

export { getStudioOverview, getMyVideo, reprocessVideo };
