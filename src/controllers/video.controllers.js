import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { getCreatedAtDiffField, formatRelativeTime, extractPublicId, escapeRegex } from "../utils/utils.js";
import { uploadOnCloudinary, deleteFromCloudinary, deleteCloudinaryFolder } from "../utils/cloudinary.js";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
// ffmpeg / ffprobe binary paths are configured once in utils/utils.js
import Ffmpeg  from "fluent-ffmpeg";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { View } from "../models/view.model.js";
import { PlayList } from "../models/playList.model.js";
import agenda from "../db/agendaSetup.js";
import { NEWEST_FIRST, MOST_VIEWED, afterCursor, decodeCursor, pageOf } from "../utils/pagination.js";
import { logger } from "../utils/logger.js";
import { removeNotificationsFor } from "../services/notification.service.js";



// common functions
const extractThumbnail = async (videoLocal, fileName, atSeconds = 5) => {
    return new Promise( (resolve, reject) => {

        const thumbnailName = `thumbnail-${fileName}.jpg`
        const thumbnailLocal = path.resolve('./public/temps', thumbnailName)

        Ffmpeg(videoLocal).on('end', () => {
            // ffmpeg reports success even when the timemark is past the end of the video and no frame was written
            if (!fs.existsSync(thumbnailLocal)) {
                return reject(new Error(`no frame at ${atSeconds}s`))
            }
            resolve(thumbnailLocal)
        }).on('error', (err) => {
            logger.warn({ err, videoLocal }, "thumbnail extraction failed")
            reject(err)
        }).screenshots({
            count: 1,
            folder: './public/temps',
            filename: thumbnailName,
            
            size: '320x240',
            timemarks: [String(atSeconds)]
        })
    })
}

// delete a multer temp file; used when a request is rejected before the file is uploaded
const removeTempFile = (filePath) => {
    if (!filePath) return
    fs.unlink(filePath, () => {})
}

const extractDuration = async (videoLocal) => {
    return new Promise((resolve, reject) => {
        Ffmpeg(videoLocal).ffprobe((err, data) => {
            if(err){
                logger.warn({ err, videoLocal }, "video duration extraction failed")
                reject(err)
            }else{
                resolve(data.format.duration)
            }
        })
    })
}





// upload videos

const uploadVideo = asyncHandler(async (req, res) => {
    const user = req.user
    const videoLocal = req.files?.video?.[0]?.path
    const videoName = req.files?.video?.[0]?.filename
    const uploadedThumbnailLocal = req.files?.thumbnail?.[0]?.path || null
    const title = req.body?.title?.trim()
    const description = req.body?.description?.trim() || ""
    const category = req.body?.category || "General"

    // every rejection before the Cloudinary upload must remove the multer temp files
    const reject = (statusCode, message) => {
        removeTempFile(videoLocal)
        removeTempFile(uploadedThumbnailLocal)
        throw new apiError(statusCode, message)
    }

    if(!videoLocal){
        reject(400,"Video is required")
    }
    if(!title){
        reject(400,"Title is required")
    }
    if(!Video.schema.path("category").enumValues.includes(category)){
        reject(400,"Invalid category")
    }

    // a file ffprobe cannot read is not a playable video
    let duration
    try {
        duration = Number(await extractDuration(videoLocal)) || 0
    } catch (error) {
        reject(400,"Could not read the video file")
    }

    let thumbnailLocal = uploadedThumbnailLocal
    if (!thumbnailLocal) {
        try {
            // 5s in, or halfway through clips shorter than 10s
            thumbnailLocal = await extractThumbnail(videoLocal, videoName, Math.min(5, duration / 2))
        } catch (error) {
            reject(422,"Could not generate a thumbnail from this video, please upload one")
        }
    }

    // uploadOnCloudinary removes the local file whether it succeeds or fails
    const videoAsset = await uploadOnCloudinary(videoLocal,"video")
    if(!videoAsset){
        removeTempFile(thumbnailLocal)
        throw new apiError(500,"Something went wrong while uploading the video")
    }
    const thumbnailAsset = await uploadOnCloudinary(thumbnailLocal,"thumbnail")
    if(!thumbnailAsset){
        await deleteFromCloudinary(videoAsset.public_id,"video")
        throw new apiError(500,"Something went wrong while uploading the thumbnail")
    }

    // create the document and schedule processing before responding, so a failure can still be rolled back
    let video = null
    try {
        video = await Video.create({
            videoFileUrl:videoAsset.url,
            thumbnailUrl:thumbnailAsset.url,
            title:title,
            description:description,
            duration:duration,
            category:category,
            owner:user._id
        })
        await agenda.schedule('in 10 seconds', 'process video chunks', { videoId: video._id })
    } catch (error) {
        logger.error({ err: error }, "failed to save uploaded video")
        if (video) await Video.deleteOne({ _id: video._id })
        await deleteFromCloudinary(videoAsset.public_id,"video")
        await deleteFromCloudinary(thumbnailAsset.public_id)
        throw new apiError(500,"Something went wrong while saving the video")
    }

    const uploadedVideo = await Video.findById(video._id).populate("owner","userName")
    return res.status(200).json(new apiResponse(200,uploadedVideo,"Video uploaded successfully"))
} )

// delete video
const deleteVideo = asyncHandler(async (req, res) => {
    const videoId = req.params.videoId
    if (!mongoose.isValidObjectId(videoId)) {
        throw new apiError(404, "Video not found")
    }
    const video = await Video.findById(videoId)
    if(!video){
        throw new apiError(404,"Video not found")
    }
    if(!video.owner.equals(req.user._id)){
        throw new apiError(403,"Unauthorized to delete this video")
    }

    // 1. the video itself, so it disappears for users immediately
    await Video.deleteOne({ _id: video._id })

    // 2. everything that references it
    const commentIds = await Comment.find({ videoId: video._id }).distinct("_id")
    await Promise.all([
        Like.deleteMany({ targetType: "Video", targetId: video._id }),
        Like.deleteMany({ targetType: "Comment", targetId: { $in: commentIds } }),
        Comment.deleteMany({ videoId: video._id }),
        View.deleteMany({ targetType: "Video", targetId: video._id }),
        PlayList.updateMany({ videos: video._id }, { $pull: { videos: video._id } }),
        User.updateMany({ watchHistory: video._id }, { $pull: { watchHistory: video._id } }),
        removeNotificationsFor({ video: video._id }),
    ])

    // 3. media, best-effort: the DB is already consistent, so failures are logged instead of failing the request
    //    - processed videos: HLS segments + manifest live in videos/<videoId>/
    //    - unprocessed videos: videoFileUrl still points at the original upload
    const mediaCleanup = await Promise.allSettled([
        deleteCloudinaryFolder(`videos/${video._id}`),
        video.status === "ready" ? Promise.resolve() : deleteFromCloudinary(video.sourcePublicId ?? extractPublicId(video.videoFileUrl), "video"),
        deleteFromCloudinary(extractPublicId(video.thumbnailUrl)),
    ])
    mediaCleanup.filter(r => r.status === "rejected").forEach(r =>
        logger.error({ err: r.reason, videoId: video._id }, "media cleanup failed for deleted video")
    )

    return res.status(200).json(new apiResponse(200, { _id: video._id }, "Video deleted successfully"))
})

//get all videos

// search filters (v2 only: v1's validator strips these params, so v1 keeps newest-first with no filters)
const UPLOADED_WITHIN_MS = { hour: 3_600_000, today: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };
// seconds: under 4 minutes, 4 to 20 minutes, over 20 minutes
const DURATION_RANGES = { short: { $lt: 240 }, medium: { $gte: 240, $lte: 1200 }, long: { $gt: 1200 } };

const getAllVideos = asyncHandler(async (req, res) => {
    const { category, query, limit, uploaded, duration } = req.query;
    const sortField = req.query.sort === "views" ? "views" : "createdAt";
    const cursor = decodeCursor(req.query.cursor, sortField);

    const matchStage = {
        isPublished: true,
        status: "ready"
    };

    if (category) {
        matchStage.category = category;
    }

    if (uploaded) {
        matchStage.createdAt = { $gte: new Date(Date.now() - UPLOADED_WITHIN_MS[uploaded]) };
    }

    if (duration) {
        matchStage.duration = DURATION_RANGES[duration];
    }

    if (query) {
        // match the text literally: raw user input in $regex allowed "(" to crash the query and ".*"-style patterns to scan everything
        const pattern = escapeRegex(query);
        matchStage.$or = [
            { title: { $regex: pattern, $options: "i" } },
            { description: { $regex: pattern, $options: "i" } }
        ];
    }
    
    // newest (or most viewed) first, one page at a time (limit + 1 tells whether another page exists)
    const videos = await Video.aggregate([
        {
            $match: cursor ? { $and: [matchStage, afterCursor(cursor, sortField)] } : matchStage
        },
        { $sort: sortField === "views" ? MOST_VIEWED : NEWEST_FIRST },
        { $limit: limit + 1 },
        {
            $lookup:{
                from:"users",
                localField:"owner",
                foreignField:"_id",
                as:"owner"
            }
        },
        {
            $unwind:"$owner"
        },
        getCreatedAtDiffField(),
        {
            $project:{
                _id:1,
                videoFileUrl:1,
                thumbnailUrl:1,
                title:1,
                views:1,
                duration:1,
                category:1,
                createdAt:1,
                createdAtDiff:1,
                owner:{
                    _id:1,
                    userName:1,
                    avatarUrl:1
                }
            }
        }
    ])
    const page = pageOf(videos, limit, sortField)
    page.items.forEach(video => {
        video.relativeTime = formatRelativeTime(video.createdAtDiff)
        delete video.createdAtDiff
    })
    return res.status(200).json(new apiResponse(200,page,"Videos fetched successfully"))
})

// videoDetails

const getVideoDetails = asyncHandler(async (req, res) => {    
    const videoId = req.params.videoId;

    if (!mongoose.isValidObjectId(videoId)) {
        return res.status(404).json(new apiResponse(404, null, "Video not found"));
    }

    try {
        const videoDetails = await Video.aggregate([
            {
                $match: {
                    _id: mongoose.Types.ObjectId.createFromHexString(videoId),
                    isPublished: true,
                    status: "ready"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner"
                }
            },
            {
                $unwind: { 
                    path: "$owner",
                    preserveNullAndEmptyArrays: true
                }
            },
            getCreatedAtDiffField(),
            {
                $project: {
                    videoFileUrl: 1,
                    thumbnailUrl: 1,
                    title: 1,
                    views: 1,
                    duration: 1,
                    status: 1,
                    description: 1,
                    category: 1,
                    createdAt: 1,
                    createdAtDiff: 1,
                    owner: {
                        _id: 1,
                        userName: 1,
                        avatarUrl: 1,
                        fullName: 1
                    }
                }
            }
        ]);

        if (videoDetails.length === 0) {
            return res.status(404).json(new apiResponse(404, null, "Video not found"));
        }
        // format result
        const video = videoDetails[0];
        video.relativeTime = formatRelativeTime(video.createdAtDiff);
        delete video.createdAtDiff;

        return res.status(200).json(new apiResponse(200, video, "Video details fetched successfully"));
    } catch (error) {
        if (res.headersSent) {
            // Don't send another response
            return;
        }
        logger.error({ err: error, videoId }, "failed to fetch video details")
        return res.status(500).json(new apiResponse(500, null, "Something went wrong while fetching video details"));
    }
});


const toggleIsPublished = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!mongoose.isValidObjectId(videoId)) {
        return res.status(404).json(new apiResponse(404, null, "Video not found"));
    }
    const video = await Video.findById(videoId)
    if(!video){
        throw new apiError(404,"Video not found")
    }
    if(!video.owner.equals(req.user._id)){
        throw new apiError(403,"Unauthorized to change this video")
    }
    video.isPublished = !video.isPublished
    await video.save({validateBeforeSave:false})
    return res.status(200).json(new apiResponse(200,video,"Video status toggled successfully"))
})


const updateVideoDetails = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    // the route uses upload.single("thumbnail"), so the file is on req.file (not req.files)
    const thumbnailLocal = req.file?.path
    const { title, description, category } = req.body

    if (!mongoose.isValidObjectId(videoId)) {
        removeTempFile(thumbnailLocal)
        throw new apiError(404, "Video not found")
    }
    const videoToUpdate = await Video.findById(videoId)
    if(!videoToUpdate){
        removeTempFile(thumbnailLocal)
        throw new apiError(404, "Video not found")
    }
    if(!videoToUpdate.owner.equals(req.user._id)){
        removeTempFile(thumbnailLocal)
        throw new apiError(403, "Unauthorized to update this video")
    }
    if (category && !Video.schema.path("category").enumValues.includes(category)) {
        removeTempFile(thumbnailLocal)
        throw new apiError(400, "Invalid category")
    }

    if(title?.trim()){
        videoToUpdate.title = title.trim()
    }
    if(description !== undefined){
        videoToUpdate.description = description
    }
    if(category){
        videoToUpdate.category = category
    }
    // v2 folds the old visibility toggle into PATCH (v1's schema strips this field)
    if(typeof req.body.isPublished === "boolean"){
        videoToUpdate.isPublished = req.body.isPublished
    }

    // upload the new thumbnail first, save, and only then delete the old one
    const oldThumbnail = videoToUpdate.thumbnailUrl
    let newThumbnail = null
    if(thumbnailLocal){
        newThumbnail = await uploadOnCloudinary(thumbnailLocal, "thumbnail")
        if(!newThumbnail){
            throw new apiError(500, "Something went wrong while uploading thumbnail")
        }
        videoToUpdate.thumbnailUrl = newThumbnail.url
    }

    try {
        await videoToUpdate.save()
    } catch (error) {
        if (newThumbnail?.public_id) await deleteFromCloudinary(newThumbnail.public_id)
        throw error
    }
    if (newThumbnail && oldThumbnail) {
        await deleteFromCloudinary(extractPublicId(oldThumbnail))
    }

    const updatedVideo = await Video.findById(videoId).select("videoFileUrl thumbnailUrl title description category isPublished")

    res.status(200).json(new apiResponse(200,updatedVideo,"Video Details Updated Successfully"))
})

const getMyVideos = asyncHandler(async (req, res) => {
    const videos = await Video.aggregate([
        {
            $match:{
                owner:req.user._id
            }
        },
        getCreatedAtDiffField(),
        {
            $project:{
                videoFileUrl:1,
                thumbnailUrl:1,
                title:1,
                views:1,
                duration:1,
                description:1,
                isPublished:1,
                status:1,
                createdAt:1,
                createdAtDiff:1
            }
        }
    ])
    if(!videos){
        throw new apiError(500,"Something went wrong while fetching Videos")
    }
    if(videos.length === 0){
        return res.status(200).json(new apiResponse(200,videos,"No videos found"))
    }
    videos.forEach(video => {
        video.relativeTime = formatRelativeTime(video.createdAtDiff)
        video.owner = {
            userName: req.user.userName,
            avatarUrl: req.user.avatarUrl
        }

        delete video.createdAtDiff
        
    })
    return res.status(200).json(new apiResponse(200,videos,"Videos fetched successfully"))
})

// Get distinct categories that actually have published+ready videos
const getCategories = asyncHandler(async (req, res) => {
    // ?all=true: every allowed category (upload / edit forms), otherwise only categories that have videos
    if (req.query.all === "true") {
        return res.status(200).json(new apiResponse(200, Video.schema.path("category").enumValues, "Categories fetched successfully"))
    }
    const categories = await Video.distinct("category", {
        isPublished: true,
        status: "ready"
    })
    // Filter out null/undefined, sort alphabetically
    const sorted = categories.filter(Boolean).sort()
    return res.status(200).json(new apiResponse(200, sorted, "Categories fetched successfully"))
})

const WATCH_HISTORY_LIMIT = 200

// the view itself is stored by the view middleware; this adds the video to a logged-in viewer's history
const recordView = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (req.user && mongoose.isValidObjectId(videoId)) {
        const id = mongoose.Types.ObjectId.createFromHexString(videoId)
        try {
            const watchable = await Video.exists({ _id: id, isPublished: true, status: "ready" })
            if (watchable) {
                // one atomic update: move the video to the front, drop its older entry, cap the list
                await User.updateOne({ _id: req.user._id }, [{
                    $set: {
                        watchHistory: {
                            $slice: [{
                                $concatArrays: [
                                    [id],
                                    { $filter: { input: { $ifNull: ["$watchHistory", []] }, cond: { $ne: ["$$this", id] } } }
                                ]
                            }, WATCH_HISTORY_LIMIT]
                        }
                    }
                }])
            }
        } catch (error) {
            // history is best-effort; never fail the view request because of it
            logger.warn({ err: error, videoId }, "watch history update failed")
        }
    }
    return res.status(204).end()
})

export {uploadVideo , deleteVideo, getAllVideos, getVideoDetails, updateVideoDetails, toggleIsPublished, getMyVideos, getCategories, recordView}