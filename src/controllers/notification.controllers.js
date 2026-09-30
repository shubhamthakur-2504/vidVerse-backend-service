import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Notification } from "../models/notification.model.js";
import { NEWEST_FIRST, afterCursor, decodeCursor, pageOf } from "../utils/pagination.js";

// the signed-in user's notifications (v2, under /me)

const firstOrNull = (name) => ({ $addFields: { [name]: { $ifNull: [{ $first: `$${name}` }, null] } } });
const lookupOne = (from, localField, as, project) => ({
    $lookup: { from, localField, foreignField: "_id", pipeline: [{ $project: project }], as },
});

// GET /v2/me/notifications: newest first, with the actor and a short preview of what it is about
const listNotifications = asyncHandler(async (req, res) => {
    const cursor = decodeCursor(req.query.cursor);
    const { limit } = req.query;
    const notifications = await Notification.aggregate([
        { $match: { recipient: req.user._id, ...afterCursor(cursor) } },
        { $sort: NEWEST_FIRST },
        { $limit: limit + 1 },
        lookupOne("users", "actor", "actor", { userName: 1, fullName: 1, avatarUrl: 1 }),
        lookupOne("videos", "video", "video", { title: 1, thumbnailUrl: 1 }),
        lookupOne("tweets", "post", "post", { content: { $substrCP: ["$content", 0, 120] } }),
        lookupOne("comments", "comment", "comment", { content: { $substrCP: ["$content", 0, 120] } }),
        firstOrNull("actor"),
        firstOrNull("video"),
        firstOrNull("post"),
        firstOrNull("comment"),
        { $project: { recipient: 0, updatedAt: 0, __v: 0 } },
    ]);
    return res
        .status(200)
        .json(new apiResponse(200, pageOf(notifications, limit), "Notifications fetched successfully"));
});

// GET /v2/me/notifications/unread-count (polled by the navbar bell)
const getUnreadCount = asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ recipient: req.user._id, readAt: null });
    return res.status(200).json(new apiResponse(200, { count }, "Unread count fetched successfully"));
});

// POST /v2/me/notifications/read { ids? }: mark the given notifications (or all of them) as read
const markNotificationsRead = asyncHandler(async (req, res) => {
    const ids = req.body.ids?.map((id) => mongoose.Types.ObjectId.createFromHexString(id));
    const result = await Notification.updateMany(
        { recipient: req.user._id, readAt: null, ...(ids && { _id: { $in: ids } }) },
        { $set: { readAt: new Date() } }
    );
    return res
        .status(200)
        .json(new apiResponse(200, { updated: result.modifiedCount }, "Notifications marked as read"));
});

export { listNotifications, getUnreadCount, markNotificationsRead };
