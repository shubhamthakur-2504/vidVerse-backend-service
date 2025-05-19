import asyncHandler from "../utils/asyncHandler.js";
import { apiResponse } from "../utils/apiResponse.js";
import { apiError } from "../utils/apiError.js";
import { Video } from "../models/video.model.js";
import { getCreatedAtDiffField, formatRelativeTime, extractPublicId } from "../utils/utils.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import path from "path";
import mongoose from "mongoose";
import Ffmpeg  from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import ffmegStatic from "ffmpeg-static";
import ffprobe from "fluent-ffmpeg";
import { Session } from "inspector/promises";
import { User } from "../models/user.model.js";

// common config
Ffmpeg.setFfmpegPath(ffmegStatic)
Ffmpeg.setFfprobePath(ffprobeStatic.path)


// common functions
const extractThumbnail = async (videoLocal, fileName) => {
    return new Promise( (resolve, reject) => {

        const thumbnailName = `thumbnail-${fileName}.jpg`
        const thumbnailLocal = path.resolve('./public/temps', thumbnailName)

        Ffmpeg(videoLocal).on('end', () => {
            console.log("Thumbnail extracted"); //to be removed after adding logs logger
            resolve(thumbnailLocal)
        }).on('error', (err) => {
            console.log("Thumbnail extraction error::", err); //to be removed after adding logs logger
            reject(err)
        }).screenshots({
            count: 1,
            folder: './public/temps',
            filename: thumbnailName,
            
            size: '320x240',
            timemarks: ["5"]
        })
    })
}

const extractDuration = async (videoLocal) => {
    return new Promise((resolve, reject) => {
        Ffmpeg(videoLocal).ffprobe((err, data) => {
            if(err){
                console.log("Video duration extraction error::", err); //to be removed after adding logs logger
                reject(err)
            }else{
                console.log("Video duration extracted"); //to be removed after adding logs logger
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
    let thumbnailLocal = req.files?.thumbnail?.[0]?.path || null
    let duration = 0
    const title = req.body?.title
    const description = req.body?.description || "Discription for this video is not provided"

    if(!user){
        throw new apiError(401,"Unauthorized")
    }
    
    if(!videoLocal){
        throw new apiError(400,"Video is required")
    }
    if(!title){
        throw new apiError(400,"Title is required")
    }
    try {
        if (!thumbnailLocal) {
            thumbnailLocal = await extractThumbnail(videoLocal, videoName);
        }
        duration = await extractDuration(videoLocal);
    } catch (error) {
        console.error("FFmpeg error:", error); //to be removed after adding logs logger
        duration = 0; // Provide a default duration to avoid crashes
    }
    

    const videoUrl = await uploadOnCloudinary(videoLocal,"video")
    const thumbnailUrl = await uploadOnCloudinary(thumbnailLocal,"thumbnail")

    if(!videoUrl || !thumbnailUrl){
        throw new apiError(500,"Something went wrong while uploading")
    }

    // const session = await mongoose.startSession()  //session only works in cluster mode not on local mode
    // session.startTransaction()
    
    try {
        const video = await Video.create({
            videoFileUrl:videoUrl?.url,
            thumbnailUrl:thumbnailUrl?.url,
            title:title,
            description:description,
            duration:duration,
            owner:user._id
        }) //in cluster using session use create([{params},{params}],{session})
        
        const uploadedVideo = await Video.findById(video._id).populate("owner","userName")

        // await session.commitTransaction() //cluster mode

        if(!uploadedVideo){
            throw new apiError(500,"Something went wrong while uploading")
        }
        return res.status(200).json(new apiResponse(200,uploadedVideo,"Video uploaded successfully"))
    } catch (error) {
        console.log("error while creating video",error);
        // await session.abortTransaction() //cluster mode
        if (videoUrl?.public_id) await deleteFromCloudinary(videoUrl?.public_id,"video")
        if (thumbnailUrl?.public_id) await deleteFromCloudinary(thumbnailUrl?.public_id)
        throw new apiError(500,"Something went wrong while uploading video and thumbnail were deleted")
    }finally{ 
        // await session.endSession() //cluster mode
    }

} )

// delete video
const deleteVideo = asyncHandler(async (req, res) => {
    const videoId = req.params.videoId
    const video = await Video.findById(videoId)
    if(!video){
        throw new apiError(404,"Video not found")
    }
    const user = req.user._id
    if(video.owner.toString() !== user.toString()){
        throw new apiError(401,"Unauthorized")
    }

    const videoPublicId = extractPublicId(video.videoFileUrl)
    const thumbnailPublicId = extractPublicId(video.thumbnailUrl)

    // const session = await mongoose.startSession() //session only works in cluster mode not on local mode
    // session.startTransaction //cluster mode

    try {
        await deleteFromCloudinary(videoPublicId,"video")
        await deleteFromCloudinary(thumbnailPublicId)
    
        await Video.findByIdAndDelete(videoId) //in cluster mode pass session as second argument in object

        // await session.commitTransaction //cluster mode

        return res.status(200).json(new apiResponse(200,"Video deleted successfully"))
    } catch (error) {
        // await session.abortTransaction //cluster mode

        console.log("error while deleting video",error); //to be removed after adding logs logger
        
        throw new apiError(500,"Something went wrong while deleting video")
    }finally{
        // await session.endSession //cluster mode
    }
})

//get all videos

const getAllVideos = asyncHandler(async (req, res) => {
    const videos = await Video.aggregate([
        {
            $match:{
                isPublished:true
            }
        },
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
                createdAtDiff:1,
                owner:{
                    userName:1,
                    avatarUrl:1
                }
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

        delete video.createdAtDiff
        
    })
    return res.status(200).json(new apiResponse(200,videos,"Videos fetched successfully"))
})

// videoDetails

const getVideoDetails = asyncHandler(async (req, res) => {
    const video = req.params.videoId
    
    try {
        const videoDetails = await Video.aggregate([
            {
                $match:{
                    _id:mongoose.Types.ObjectId.createFromHexString(video),
                    isPublished:true
                }
            },
            {
                $lookup:{
                    from:"users",
                    localField:"owner",
                    foreignField:"_id",
                    as:"owner"
                }
            },
            {
                $unwind:{ 
                    path: "$owner",
                    preserveNullAndEmptyArrays: true
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
                    createdAtDiff:1,
                    owner:{
                        userName:1,
                        avatarUrl:1
                    }
                }
            }
    
        ])
        if(videoDetails.length === 0){
            throw new apiError(404,"Video not found")
        }
    
        videoDetails[0].relativeTime = formatRelativeTime(videoDetails[0].createdAtDiff)
        delete videoDetails[0].createdAtDiff
        
        
    
        return res.status(200).json(new apiResponse(200,videoDetails[0],"Video details fetched successfully"))
    } catch (error) {
        console.log(error);
        throw new apiError(404,"Video not found")
    }
})

const toggleIsPublished = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const video = await Video.findById(videoId)
    if(!video){
        throw new apiError(404,"Video not found")
    }
    if(!video.owner.equals(req.user._id)){
        throw new apiError(401,"Unauthorized")
    }
    video.isPublished = !video.isPublished
    await video.save({validateBeforeSave:false})
    return res.status(200).json(new apiResponse(200,video,"Video status toggled successfully"))
})


const updateVideoDetails = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const {title, description} = req.body
    const thumbnailLocal = req.files?.thumbnail?.[0]?.path
    const videoToUpdate = await Video.findById(videoId)


    if(!videoToUpdate){
        throw  new apiError(404, "Video not found")
    }
    if(!videoToUpdate.owner.equals(req.user._id)){
        throw new apiError(401, "Unauthorized")
    }
    
    const oldThumbnail = videoToUpdate.thumbnailUrl

    try {
        if(thumbnailLocal){ 
            const thumbnail = await uploadOnCloudinary(thumbnailLocal,"thumbnail")
            if(!thumbnail){
                throw new apiError(500,"Something went wrong while uploading thumbnail")
            }
            try {
                const thumbnailPublicIdOld = extractPublicId(oldThumbnail)
                videoToUpdate.thumbnailUrl = thumbnail
                if(videoToUpdate.thumbnailUrl !== oldThumbnail){
                    await deleteFromCloudinary(thumbnailPublicIdOld)
                }
            } catch (error) {
                videoToUpdate.thumbnailUrl = oldThumbnail
                await deleteFromCloudinary(thumbnail.public_id)
                console.log("error in updateVideoDetails:video controller:: error ",error);
                throw new apiError(500,"Something went wrong while updating thumbnail")
            }
        }
    
    } catch (error) {
        throw new apiError(500,"Something went wrong while updating video details")
    }
    if(title){
        videoToUpdate.title=title 
    }
    if(description){
        videoToUpdate.description = description
    }
    await videoToUpdate.save({validateBeforeSave:false})

    const updatedVideo = await Video.findById(videoId).select("videoFileUrl thumbnailUrl title description ")

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

export {uploadVideo , deleteVideo, getAllVideos, getVideoDetails, updateVideoDetails, toggleIsPublished, getMyVideos}