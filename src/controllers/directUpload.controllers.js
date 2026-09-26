import crypto from "crypto";
import fs from "fs";
import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { signVideoUpload } from "../utils/cloudinarySignature.js";
import { getVideoResource, uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { config } from "../config.js";
import agenda from "../db/agendaSetup.js";
import { logger } from "../utils/logger.js";

// Direct upload: the browser sends the original file straight to Cloudinary storage (large files never pass
// through this server), then registers it here; our ffmpeg worker turns it into adaptive HLS.
//   1. POST /v2/videos/upload-intent  -> signed parameters for one upload under uploads/<userId>/<uuid>
//   2. browser -> Cloudinary          (chunked for files over CHUNK_BYTES)
//   3. POST /v2/videos/from-upload    -> checks the upload, creates the video, queues processing

const CHUNK_BYTES = 20 * 1024 * 1024;
const uploadPrefixFor = (userId) => `uploads/${userId}/`;

const createUploadIntent = asyncHandler(async (req, res) => {
    const publicId = `${uploadPrefixFor(req.user._id)}${crypto.randomUUID()}`;
    return res.status(200).json(new apiResponse(200, {
        ...signVideoUpload(publicId),
        maxBytes: config.uploads.maxVideoBytes,
        chunkBytes: CHUNK_BYTES,
    }, "Upload authorised"));
});

const createVideoFromUpload = asyncHandler(async (req, res) => {
    const { publicId, title, description = "", category = "General" } = req.body;
    const thumbnailLocal = req.file?.path;
    const reject = (statusCode, message) => {
        if (thumbnailLocal) fs.unlink(thumbnailLocal, () => {});
        throw new apiError(statusCode, message);
    };

    // the prefix is chosen and signed by the server, so it proves whose upload this is
    if (!publicId.startsWith(uploadPrefixFor(req.user._id))) reject(403, "This upload does not belong to you");
    if (await Video.exists({ sourcePublicId: publicId })) reject(409, "This upload is already registered");

    const resource = await getVideoResource(publicId);
    if (!resource) reject(400, "Upload not found, upload the file first");
    if (resource.bytes > config.uploads.maxVideoBytes) {
        await deleteFromCloudinary(publicId, "video");
        reject(413, "Video is larger than the upload limit");
    }

    let thumbnail = null;
    if (thumbnailLocal) {
        thumbnail = await uploadOnCloudinary(thumbnailLocal, "thumbnail");
        if (!thumbnail) throw new apiError(500, "Something went wrong while uploading the thumbnail");
    }

    // create and queue before responding so a failure can be rolled back; the source stays for a retry
    let video = null;
    try {
        video = await Video.create({
            videoFileUrl: resource.secure_url,
            sourcePublicId: publicId,
            thumbnailUrl: thumbnail?.url,
            title,
            description,
            category,
            duration: Number(resource.duration) || 0,
            owner: req.user._id,
            status: "processing",
        });
        await agenda.schedule("in 5 seconds", "process video chunks", { videoId: video._id });
    } catch (error) {
        logger.error({ err: error, publicId }, "failed to register direct upload");
        if (video) await Video.deleteOne({ _id: video._id });
        if (thumbnail?.public_id) await deleteFromCloudinary(thumbnail.public_id);
        throw new apiError(500, "Something went wrong while saving the video");
    }

    return res.status(201).json(new apiResponse(201, video, "Video uploaded, processing has started"));
});

export { createUploadIntent, createVideoFromUpload };
