import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { getCreatedAtDiffField, formatRelativeTime, isEdited, canEdit } from "../utils/utils.js";
import { NEWEST_FIRST, afterCursor, decodeCursor, pageOf } from "../utils/pagination.js";
import { reactionCountsLookup, viewerReactionLookup, countFrom, reactionOf } from "./watch.controllers.js";

// Community posts (v2, stored as tweets). Every read returns the same shape: the author, reaction and comment
// counts, and the viewer's own state (reaction, owner, whether the 15-minute edit window is still open).

const OWNER_FIELDS = { _id: 1, userName: 1, fullName: 1, avatarUrl: 1 };

const postStages = (viewerId) => [
    { $lookup: { from: "users", localField: "owner", foreignField: "_id", pipeline: [{ $project: OWNER_FIELDS }], as: "owner" } },
    { $unwind: "$owner" },
    reactionCountsLookup("Tweet", "reactionCounts"),
    viewerReactionLookup("Tweet", viewerId, "viewerReaction"),
    { $lookup: { from: "comments", localField: "_id", foreignField: "tweetId", pipeline: [{ $count: "n" }], as: "comments" } },
    getCreatedAtDiffField(),
];

const shapePost = (post, viewerId) => {
    const isOwner = Boolean(viewerId?.equals(post.owner._id));
    return {
        _id: post._id,
        content: post.content,
        image: post.image ?? null,
        owner: post.owner,
        createdAt: post.createdAt,
        relativeTime: formatRelativeTime(post.createdAtDiff),
        isEdited: isEdited(post.createdAt, post.updatedAt),
        likeCount: countFrom(post.reactionCounts, true),
        dislikeCount: countFrom(post.reactionCounts, false),
        commentCount: post.comments[0]?.n ?? 0,
        viewerReaction: reactionOf(post.viewerReaction),
        isOwner,
        canEdit: isOwner && canEdit(post.createdAt),
    };
};

// one page of posts matching `match`, newest first
const pageOfPosts = async (match, req) => {
    const cursor = decodeCursor(req.query.cursor);
    const { limit } = req.query;
    const viewerId = req.user?._id ?? null;
    const posts = await Tweet.aggregate([
        { $match: { ...match, ...afterCursor(cursor) } },
        { $sort: NEWEST_FIRST },
        { $limit: limit + 1 },
        ...postStages(viewerId),
    ]);
    // the cursor comes from the raw documents, so shape the items after paging
    const page = pageOf(posts, limit);
    page.items = page.items.map((post) => shapePost(post, viewerId));
    return page;
};

// GET /v2/posts: every channel's posts
const getPostFeed = asyncHandler(async (req, res) => {
    return res.status(200).json(new apiResponse(200, await pageOfPosts({}, req), "Posts fetched successfully"));
});

// GET /v2/channels/:userName/posts
const getChannelPosts = asyncHandler(async (req, res) => {
    const channel = await User.findOne({ userName: req.params.userName.toLowerCase() }).select("_id").lean();
    if (!channel) throw new apiError(404, "Channel not found");
    return res.status(200).json(new apiResponse(200, await pageOfPosts({ owner: channel._id }, req), "Channel posts fetched successfully"));
});

// GET /v2/posts/:id
const getPost = asyncHandler(async (req, res) => {
    const postId = mongoose.Types.ObjectId.createFromHexString(req.params.id);
    const viewerId = req.user?._id ?? null;
    const [post] = await Tweet.aggregate([{ $match: { _id: postId } }, ...postStages(viewerId)]);
    if (!post) throw new apiError(404, "Post not found");
    return res.status(200).json(new apiResponse(200, shapePost(post, viewerId), "Post fetched successfully"));
});

export { getPostFeed, getChannelPosts, getPost };
