import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Subscription } from "../models/subscription.model.js";
import { NEWEST_FIRST, afterCursor, decodeCursor, pageOf } from "../utils/pagination.js";

const PUBLIC_VIDEO = { isPublished: true, status: "ready" };

const findChannel = async (userName) => {
    const channel = await User.findOne({ userName: userName.toLowerCase() }).select("userName fullName avatarUrl coverImageUrl createdAt").lean();
    if (!channel) throw new apiError(404, "Channel not found");
    return channel;
};

// public channel page header: profile, counts, and whether the viewer (if signed in) is subscribed
const getChannel = asyncHandler(async (req, res) => {
    const channel = await findChannel(req.params.userName);
    const [subscribersCount, videosCount, subscribed] = await Promise.all([
        Subscription.countDocuments({ channel: channel._id }),
        Video.countDocuments({ owner: channel._id, ...PUBLIC_VIDEO }),
        req.user ? Subscription.exists({ subscriber: req.user._id, channel: channel._id }) : null,
    ]);
    return res.status(200).json(new apiResponse(200, {
        ...channel,
        subscribersCount,
        videosCount,
        isSubscribed: Boolean(subscribed),
        isOwner: Boolean(req.user?._id.equals(channel._id)),
    }, "Channel fetched successfully"));
});

// a channel's public videos, newest first (cursor pagination)
const getChannelVideos = asyncHandler(async (req, res) => {
    const channel = await findChannel(req.params.userName);
    const { limit } = req.query;
    const cursor = decodeCursor(req.query.cursor);
    const videos = await Video.find({ owner: channel._id, ...PUBLIC_VIDEO, ...afterCursor(cursor) })
        .sort(NEWEST_FIRST)
        .limit(limit + 1)
        .select("title thumbnailUrl duration views category createdAt")
        .lean();
    const page = pageOf(videos, limit);
    page.items = page.items.map((video) => ({ ...video, owner: { _id: channel._id, userName: channel.userName, fullName: channel.fullName, avatarUrl: channel.avatarUrl } }));
    return res.status(200).json(new apiResponse(200, page, "Channel videos fetched successfully"));
});

export { getChannel, getChannelVideos };
