import mongoose, { Schema } from "mongoose";

// in-app notifications. `actor` did something that concerns `recipient`:
// - subscribe: actor subscribed to the recipient's channel
// - video: actor (a channel the recipient follows) published `video`
// - comment: actor commented (`comment`) on the recipient's `video` or `post`
const notificationSchema = new Schema({
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["subscribe", "video", "comment"], required: true },
    video: { type: Schema.Types.ObjectId, ref: "Video" },
    post: { type: Schema.Types.ObjectId, ref: "Tweet" },
    comment: { type: Schema.Types.ObjectId, ref: "Comment" },
    readAt: { type: Date, default: null },
}, { timestamps: true });

// a user's notifications newest first (cursor: createdAt + _id), and the unread count
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
// removing the notifications about a deleted video, post or comment
notificationSchema.index({ video: 1 }, { sparse: true });
notificationSchema.index({ post: 1 }, { sparse: true });
notificationSchema.index({ comment: 1 }, { sparse: true });
// kept for 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification = mongoose.model("Notification", notificationSchema);
