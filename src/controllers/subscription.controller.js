import { apiError } from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Subscription } from "../models/subscription.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

const createSubscription = asyncHandler(async (req, res) => {
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const userId = req.user._id
    if(userId.equals(channelId)){
        throw new apiError(400,"You cannot subscribe to yourself")
    }
    const channel = await User.exists({_id:channelId})
    if(!channel){
        throw new apiError(404,"Channel not found")
    }
    try {
        const subscription = await Subscription.create({
            subscriber:userId,
            channel:channelId
        })
        res.status(201).json(new apiResponse(201,subscription,"Subscribed successfully"))
    } catch (error) {
        if(error.code === 11000){
            throw new apiError(400,"You are already subscribed to this channel")
        }
        throw new apiError(500,"Something went wrong while subscribing")
    }
})

const deleteSubscription = asyncHandler(async (req, res) => {
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const userId = req.user._id
    try {
        const deletedSubscription = await Subscription.findOneAndDelete({
            subscriber:userId,
            channel:channelId
        })
        if(!deletedSubscription){
            throw new apiError(404,"Subscription not found")
        }
        res.status(200).json(new apiResponse(200,null,"Subscription deleted successfully"))
    }catch (error) {
        throw new apiError(500,"Something went wrong while deleting subscription")
    }
})

const mySubscriptions = asyncHandler(async (req, res) => {
    const userId = req.user._id
    try {
        const subscriptions = await Subscription.aggregate([
            {
                $match:{
                    subscriber:userId
                }
            },
            {
                $lookup:{
                    from:"users",
                    localField:"channel",
                    foreignField:"_id",
                    as:"channel"
                }
            },
            {
                $unwind:"$channel"
            },
            {
                $project:{
                    _id:1,
                    channel:{
                        _id:1,
                        userName:1,
                        avatarUrl:1
                    }
                }
            }
        ])
        res.status(200).json(new apiResponse(200,subscriptions,"Subscriptions fetched successfully"))
    } catch (error){
        throw new apiError(500,"Something went wrong while fetching subscriptions")
    }
})

const subCount = asyncHandler(async (req, res) => {
    const channelId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    try {
        const count = await Subscription.countDocuments({channel:channelId})
        res.status(200).json(new apiResponse(200,{count},"Subscriptions count fetched successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while fetching subscriptions count")
    }
})

export {createSubscription, deleteSubscription, mySubscriptions, subCount}