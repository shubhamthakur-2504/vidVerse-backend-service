import mongoose, {Schema} from "mongoose";

const viewSchema = new Schema({
  targetId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  targetType: {
    type: String,
    enum: ["Video", "Tweet"],
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  viewerHash: {
    type: String,
    required: true,
  },
  processed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: "6h",
  },
  _ipAddress: { type: String, select: false },
  _userAgent: { type: String, select: false },
});



viewSchema.index({ targetId: 1, targetType: 1, viewerHash: 1 }, { unique: true });


export const View = mongoose.model("View",viewSchema);
