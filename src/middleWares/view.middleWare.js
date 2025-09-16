import {apiError} from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { View } from "../models/view.model.js";

export const createView = asyncHandler(async (req, res, next) => {
  const targetId = req.params.id;
  const targetType = req.type === "video" ? "Video" : "Tweet";
  const userId = req.user?._id || null;

  if (!mongoose.isValidObjectId(targetId)) {
    throw new apiError(400, "Invalid target id");
  }

  const view = new View({
    targetId,
    targetType,
    userId,
    _ipAddress: req.ip,
    _userAgent: req.get("User-Agent") || "Unknown",
  });

  try {
    await view.save(); // viewerHash is computed here
  } catch (error) {
    if (error.code === 11000) {
      // duplicate view, ignore
    } else {
      console.log("View creation error::", error);
    }
  }

  next();
});
