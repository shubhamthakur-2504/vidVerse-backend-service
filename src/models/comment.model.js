import mongoose, { Schema } from "mongoose";

const commentSchema = new Schema(
    {
        content: {
            type: String,
            required: true,
        },
        videoId: {
            type: Schema.Types.ObjectId,
            ref: "Video",
        },
        tweetId: {
            type: Schema.Types.ObjectId,
            ref: "Tweet",
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

// comments of a video / tweet, newest first (cursor: createdAt + _id)
commentSchema.index({ videoId: 1, createdAt: -1, _id: -1 });
commentSchema.index({ tweetId: 1, createdAt: -1, _id: -1 });

export const Comment = mongoose.model("Comment", commentSchema);
