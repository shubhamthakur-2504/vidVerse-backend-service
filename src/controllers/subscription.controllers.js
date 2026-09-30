import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { Subscription } from "../models/subscription.model.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { notifySubscribed } from "../services/notification.service.js";
import { NEWEST_FIRST, afterCursor, decodeCursor, pageOf } from "../utils/pagination.js";

const subscribe = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    if (req.user._id.equals(channelId)) {
        throw new apiError(400, "Cannot subscribe to yourself");
    }
    const channelExists = await User.exists({ _id: channelId });
    if (!channelExists) {
        throw new apiError(404, "Channel not found");
    }
    try {
        const subscription = await Subscription.create({
            subscriber: req.user._id,
            channel: channelId,
        });
        await notifySubscribed(req.user._id, channelId);
        return res.status(201).json(new apiResponse(201, subscription, "Subscribed successfully"));
    } catch (error) {
        if (error.code === 11000) {
            throw new apiError(409, "Already subscribed");
        }
        throw new apiError(500, "Something went wrong while subscribing");
    }
});

const unsubscribe = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    try {
        const subscription = await Subscription.findOneAndDelete({
            subscriber: req.user._id,
            channel: channelId,
        });
        if (!subscription) {
            throw new apiError(404, "Subscription not found");
        }
        return res.status(204).json(new apiResponse(204, subscription, "Unsubscribed successfully"));
    } catch (error) {
        if (error instanceof apiError) {
            throw error;
        }
        throw new apiError(500, "Something went wrong while unsubscribing");
    }
});

const subscribersCount = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const channelExists = await User.exists({ _id: channelId });
    if (!channelExists) {
        throw new apiError(404, "Channel not found");
    }
    try {
        const count = await Subscription.countDocuments({ channel: channelId });
        return res.status(200).json(new apiResponse(200, { count }, "Subscribers count fetched successfully"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while fetching subscribers count");
    }
});

const isSubscribed = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const channelExists = await User.exists({ _id: channelId });
    if (!channelExists) {
        throw new apiError(404, "Channel not found");
    }
    try {
        const subscription = await Subscription.exists({
            subscriber: req.user._id,
            channel: channelId,
        });
        return res
            .status(200)
            .json(new apiResponse(200, { isSubscribed: !!subscription }, "Subscription status fetched successfully"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while checking subscription");
    }
});

const Mysubscriptions = asyncHandler(async (req, res) => {
    const cursor = decodeCursor(req.query.cursor);
    const { limit } = req.query;
    try {
        // newest first, one page at a time (limit + 1 tells whether another page exists)
        const subscriptions = await Subscription.find({ subscriber: req.user._id, ...afterCursor(cursor) })
            .sort(NEWEST_FIRST)
            .limit(limit + 1)
            .populate("channel", "userName fullName avatarUrl")
            .lean();
        return res
            .status(200)
            .json(new apiResponse(200, pageOf(subscriptions, limit), "Subscriptions fetched successfully"));
    } catch (error) {
        throw new apiError(500, "Something went wrong while fetching subscriptions");
    }
});

// v2: PUT is idempotent, so subscribing twice is a success rather than a 409
const putSubscription = asyncHandler(async (req, res) => {
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    if (req.user._id.equals(channelId)) {
        throw new apiError(400, "Cannot subscribe to yourself");
    }
    if (!(await User.exists({ _id: channelId }))) {
        throw new apiError(404, "Channel not found");
    }
    const result = await Subscription.updateOne(
        { subscriber: req.user._id, channel: channelId },
        { $setOnInsert: { subscriber: req.user._id, channel: channelId } },
        { upsert: true }
    );
    const created = result.upsertedCount === 1;
    if (created) await notifySubscribed(req.user._id, channelId);
    return res
        .status(created ? 201 : 200)
        .json(
            new apiResponse(
                created ? 201 : 200,
                { channel: channelId, isSubscribed: true },
                created ? "Subscribed successfully" : "Already subscribed"
            )
        );
});

// v2: GET /me/subscriptions/videos: public videos from every channel the user follows, newest first
const getSubscriptionFeed = asyncHandler(async (req, res) => {
    const cursor = decodeCursor(req.query.cursor);
    const { limit } = req.query;
    const channelIds = await Subscription.distinct("channel", { subscriber: req.user._id });
    if (channelIds.length === 0) {
        return res
            .status(200)
            .json(new apiResponse(200, { items: [], nextCursor: null }, "Subscription feed fetched successfully"));
    }
    const videos = await Video.find({
        owner: { $in: channelIds },
        status: "ready",
        isPublished: true,
        ...afterCursor(cursor),
    })
        .sort(NEWEST_FIRST)
        .limit(limit + 1)
        .select("title thumbnailUrl duration views category createdAt owner")
        .populate("owner", "userName fullName avatarUrl")
        .lean();
    return res.status(200).json(new apiResponse(200, pageOf(videos, limit), "Subscription feed fetched successfully"));
});

export {
    subscribe,
    unsubscribe,
    subscribersCount,
    isSubscribed,
    Mysubscriptions,
    putSubscription,
    getSubscriptionFeed,
};
