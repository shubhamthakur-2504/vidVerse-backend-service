import mongoose, {Schema} from "mongoose";
import crypto from "crypto";

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
});

viewSchema.pre("save", function (next) {
  if (this.isModified("viewerHash")) return next(); 
  
  this.viewerHash = crypto
    .createHash("sha256")
    .update(this._ipAddress + this._userAgent) 
    .digest("hex");

  next();
});

viewSchema.index({ targetId: 1, targetType: 1, viewerHash: 1 }, { unique: true });


export const View = mongoose.model("View",viewSchema);
