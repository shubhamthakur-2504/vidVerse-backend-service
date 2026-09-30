import { Notification } from "../models/notification.model.js";
import { Subscription } from "../models/subscription.model.js";
import { logger } from "../utils/logger.js";

// Creating notifications is best effort: a failure is logged and never fails the action that caused it.

const FAN_OUT_BATCH = 1000;

const safely = async (label, work) => {
    try {
        await work();
    } catch (error) {
        logger.error({ err: error }, `notification failed: ${label}`);
    }
};

// someone subscribed to `channelId`
export const notifySubscribed = (subscriberId, channelId) =>
    safely("subscribe", () => Notification.create({ recipient: channelId, actor: subscriberId, type: "subscribe" }));

// someone commented on a video or post; its owner hears about it unless they wrote the comment
export const notifyCommented = ({ commenterId, ownerId, commentId, videoId, postId }) => {
    if (!ownerId || ownerId.equals(commenterId)) return Promise.resolve();
    return safely("comment", () =>
        Notification.create({
            recipient: ownerId,
            actor: commenterId,
            type: "comment",
            comment: commentId,
            ...(videoId ? { video: videoId } : { post: postId }),
        })
    );
};

// a channel published a video: every subscriber is told, in batches so a large channel doesn't build one huge insert
export const notifyNewVideo = (video) =>
    safely("video", async () => {
        const subscribers = await Subscription.distinct("subscriber", { channel: video.owner });
        for (let i = 0; i < subscribers.length; i += FAN_OUT_BATCH) {
            const batch = subscribers
                .slice(i, i + FAN_OUT_BATCH)
                .map((recipient) => ({ recipient, actor: video.owner, type: "video", video: video._id }));
            await Notification.insertMany(batch, { ordered: false });
        }
    });

// the thing a notification points at is gone
export const removeNotificationsFor = (filter) => safely("cleanup", () => Notification.deleteMany(filter));
