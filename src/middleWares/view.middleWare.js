import {apiError} from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { View } from "../models/view.model.js";
import mongoose from "mongoose";
import crypto from "crypto";

export const createView = asyncHandler(async (req, res, next) => {
  
  // video routes name the param :videoId, tweet routes name it :id
  let targetId = req.params.videoId ?? req.params.id;
  const targetType = req.type === "video" ? "Video" : "Tweet";
  const userId = req.user?._id || null;

  if (!mongoose.isValidObjectId(targetId)) {
    console.log("hit invalid id"); //to be removed after adding logs logger
    
    return next();
  }
  
  targetId = mongoose.Types.ObjectId.createFromHexString(targetId);
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.get("User-Agent") || "Unknown";
  // logged-in viewers are identified by account, so they count once per 6h window regardless of device/network
  const viewerKey = userId ? `user:${userId}` : `anon:${ipAddress}|${userAgent}`;
  const viewerHash = crypto.createHash("sha256").update(viewerKey).digest("hex");
  
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
