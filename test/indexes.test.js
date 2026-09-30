import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { Video } from "../src/models/video.model.js";
import { Comment } from "../src/models/comment.model.js";
import { Tweet } from "../src/models/tweet.model.js";
import { Subscription } from "../src/models/subscription.model.js";
import { Like } from "../src/models/like.model.js";
import { User } from "../src/models/user.model.js";
import { PlayList } from "../src/models/playList.model.js";
import { Notification } from "../src/models/notification.model.js";

// the stage that reads documents: IXSCAN when an index serves the query, COLLSCAN when it scans everything
const scanStage = (plan) => {
    let node = plan.queryPlanner.winningPlan;
    while (node.inputStage || node.queryPlan) node = node.queryPlan ?? node.inputStage;
    return node.stage;
};

describe("indexes serve the hot queries", () => {
    beforeAll(async () => {
        await Promise.all(
            [Video, Comment, Tweet, Subscription, Like, User, PlayList, Notification].map((model) =>
                model.syncIndexes()
            )
        );
    });

    const id = new mongoose.Types.ObjectId();
    it.each([
        ["feed", () => Video.find({ status: "ready", isPublished: true }).sort({ createdAt: -1, _id: -1 }).limit(24)],
        [
            "feed by category",
            () =>
                Video.find({ category: "Music", status: "ready", isPublished: true })
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(24),
        ],
        ["my videos", () => Video.find({ owner: id }).sort({ createdAt: -1 })],
        [
            "search by views",
            () => Video.find({ status: "ready", isPublished: true }).sort({ views: -1, _id: -1 }).limit(24),
        ],
        [
            "subscriptions feed",
            () =>
                Video.find({ owner: { $in: [id, new mongoose.Types.ObjectId()] }, status: "ready", isPublished: true })
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(24),
        ],
        ["video comments", () => Comment.find({ videoId: id }).sort({ createdAt: -1, _id: -1 }).limit(20)],
        ["tweet feed", () => Tweet.find({}).sort({ createdAt: -1, _id: -1 }).limit(20)],
        ["my subscriptions", () => Subscription.find({ subscriber: id }).sort({ createdAt: -1, _id: -1 })],
        ["like count", () => Like.find({ targetId: id, targetType: "Video", isLike: true })],
        ["watch-history cleanup", () => User.find({ watchHistory: id })],
        ["playlist cleanup", () => PlayList.find({ videos: id })],
        ["my notifications", () => Notification.find({ recipient: id }).sort({ createdAt: -1, _id: -1 }).limit(20)],
        ["unread notifications", () => Notification.find({ recipient: id, readAt: null })],
    ])("%s uses an index", async (_label, query) => {
        const plan = await query().explain("queryPlanner");
        expect(scanStage(plan)).toBe("IXSCAN");
    });

    // stages anywhere in the winning plan: a SORT stage means the results were sorted in memory
    const stagesOf = (node) =>
        node
            ? [
                  node.stage,
                  ...stagesOf(node.inputStage ?? node.queryPlan),
                  ...(node.inputStages ?? []).flatMap(stagesOf),
              ]
            : [];
    it.each([
        ["feed", () => Video.find({ status: "ready", isPublished: true }).sort({ createdAt: -1, _id: -1 }).limit(24)],
        [
            "search by views",
            () => Video.find({ status: "ready", isPublished: true }).sort({ views: -1, _id: -1 }).limit(24),
        ],
    ])("%s is sorted by the index, not in memory", async (_label, query) => {
        const plan = await query().explain("queryPlanner");
        expect(stagesOf(plan.queryPlanner.winningPlan)).not.toContain("SORT");
    });

    it("control: an unindexed query is reported as a collection scan", async () => {
        const plan = await Video.find({ title: "anything" }).explain("queryPlanner");
        expect(scanStage(plan)).toBe("COLLSCAN");
    });
});
