import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { Subscription } from "../models/subscription.model.js";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";

const subscribe = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    if (req.user._id.equals(channelId)) {
        throw new apiError(400, "Cannot subscribe to yourself");
    }
    const channelExists = await User.exists({_id: channelId});
    if (!channelExists) {
        throw new apiError(404, "Channel not found");
    }
    try {
        const subscription = await Subscription.create({
            subscriber: req.user._id,
            channel: channelId
        })
        return res.status(201).json(new apiResponse(201, subscription, "Subscribed successfully"))
    } catch (error) {
        if(error.code === 11000){
            throw new apiError(409,"Already subscribed")
        }
        throw new apiError(500,"Something went wrong while subscribing")
    }
})

const unsubscribe = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    try {
        const subscription = await Subscription.findOneAndDelete({
            subscriber: req.user._id,
            channel: channelId
        })
        if (!subscription) {
            throw new apiError(404, "Subscription not found");
        }
        return res.status(204).json(new apiResponse(204, subscription, "Unsubscribed successfully"))
    } catch (error) {
        if (error instanceof apiError) {
            throw error;
        }
        throw new apiError(500,"Something went wrong while unsubscribing") 
    }
})

const subscribersCount = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const channelExists = await User.exists({_id: channelId});
    if (!channelExists) {
        throw new apiError(404, "Channel not found");
    }
    try {
        const count = await Subscription.countDocuments({ channel: channelId })
        return res.status(200).json(new apiResponse(200, { count }, "Subscribers count fetched successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while fetching subscribers count")
    }
})

const isSubscribed = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        throw new apiError(400, "Invalid channel id");
    }
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const channelExists = await User.exists({_id: channelId});
    if (!channelExists) {
        throw new apiError(404, "Channel not found");
    }
    try {
        const subscription = await Subscription.exists({
            subscriber: req.user._id,
            channel: channelId
        })
        return res.status(200).json(new apiResponse(200, { isSubscribed: !!subscription }, "Subscription status fetched successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while checking subscription")
    }
})

const Mysubscriptions = asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit
    try {
        const subscriptions = await Subscription.find({ subscriber: req.user._id }).skip(skip).limit(limit).populate('channel', 'userName')
        return res.status(200).json(new apiResponse(200, subscriptions, "Subscriptions fetched successfully"))
        // can use this for better frontend experience will refine it as per need in frontend
        // const total = await Subscription.countDocuments({ subscriber: req.user._id })
        // return res.status(200).json(new apiResponse(200, {subscriptions,pagination: {total,page,limit,pages: Math.ceil(total / limit)}}, "Subscriptions fetched successfully"))

    } catch (error) {
        throw new apiError(500,"Something went wrong while fetching subscriptions")
    }
})

export { subscribe, unsubscribe, subscribersCount, isSubscribed, Mysubscriptions }