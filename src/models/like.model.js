import mongoose, { Schema } from "mongoose";

const likeSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "User",
        },
        targetId: {
            type: Schema.Types.ObjectId,
            required: true,
        },
        targetType: {
            type: String,
            enum: ["Video", "Tweet", "Comment"],
            required: true,
        },
        isLike: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

likeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });
// counts per target and reaction (the field is isLike; the old index on "islike" matched nothing).
// its targetId/targetType prefix also serves lookups by target, so a separate index on those is not needed
likeSchema.index({ targetId: 1, targetType: 1, isLike: 1 });

export const Like = mongoose.model("Like", likeSchema);
