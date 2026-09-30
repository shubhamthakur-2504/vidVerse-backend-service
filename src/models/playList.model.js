import mongoose, { Schema } from "mongoose";

const playListSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
        },
        thumbnailUrl: {
            type: String,
            required: true,
        },
        exclusiveThumbnail: {
            type: Boolean,
            default: false,
        },
        videos: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video",
            },
        ],
        ownerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

// a user's playlists, and the $pull of a deleted video from every playlist containing it
playListSchema.index({ ownerId: 1 });
playListSchema.index({ videos: 1 });

export const PlayList = mongoose.model("PlayList", playListSchema);
