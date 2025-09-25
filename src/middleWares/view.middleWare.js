import {apiError} from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { View } from "../models/view.model.js";
import mongoose from "mongoose";
import crypto from "crypto";

export const createView = asyncHandler(async (req, res, next) => {
  
  let targetId = req.params.videoId;
  const targetType = req.type === "video" ? "Video" : "Tweet";
  const userId = req.user?._id || null;

  if (!mongoose.isValidObjectId(targetId)) {
    console.log("hit invalid id"); //to be removed after adding logs logger
    
    return next();
  }
  
  targetId = mongoose.Types.ObjectId.createFromHexString(targetId);
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.get("User-Agent") || "Unknown";
  const viewerHash = crypto.createHash("sha256").update(ipAddress + userAgent).digest("hex");
  
  const view = new View({
    targetId,
    targetType,
    userId,
    viewerHash,
  });

  
  try {
    await view.save();
    
    next();
  } catch (error) {
    if (error.code === 11000) {
      // duplicate view, ignore
      next();
    } else {
      console.log("View creation error::", error); //to be removed after adding logs logger
      throw new apiError(500, "Internal server error while creating view");
    }
  }
});
