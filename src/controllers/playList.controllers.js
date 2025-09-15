import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { PlayList } from "../models/playlist.model.js";
import { Video } from "../models/video.model.js";
import mongoose from "mongoose";
import {uploadOnCloudinary,deleteFromCloudinary} from "../utils/cloudinary.js"
import {extractPublicId} from "../utils/utils.js";

const createPlayList = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { //need this to apply on every id param #improvement
        throw new apiError(400, "Invalid video id");
    }
    const videoId = mongoose.Types.ObjectId.createFromHexString(req.params.id)

    if(!videoId){
        throw new apiError(400,"Video require to create playlist")
    }

    let title = req.body.title || null
    const description = req.body.description || ""
    const thumbnailLocal = req.file?.path || null

    const video = await Video.findById(videoId).select("title thumbnailUrl owner")
    if(!video){
        throw new apiError(404,"Video does not exist")
    }
    if (!title) {
        title = video.title
    }
    let thumbnail
    let thumbnailExclusive = false
    if(thumbnailLocal){
        try {
            thumbnail = await uploadOnCloudinary(thumbnailLocal,"thumbnail")
            thumbnail = thumbnail.url
            thumbnailExclusive = true
        } catch (error) {
            if(thumbnail){
                await deleteFromCloudinary(extractPublicId(thumbnail),"thumbnail")
            }
            thumbnail = video.thumbnailUrl
        }
    }else{
        thumbnail = video.thumbnailUrl
    }

    if(req.type === "creatorplaylist"){
        if(!req.user._id.equals(video.owner)){
            throw new apiError(403,"Unauthorized to create playlist")
        }
    }
    try {
        const playList = await PlayList.create({
            title:title,
            description:description,
            thumbnailUrl:thumbnail,
            exclusiveThumbnail:thumbnailExclusive,
            videos:[videoId],
            ownerId:req.user._id
        })
        res.status(200).json(new apiResponse(200,playList,"Playlist created successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while creating playlist")
    }
})

const deletePlayList = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { 
        throw new apiError(400, "Invalid playlist id");
    }
    const playListId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const playList = await PlayList.findById(playListId)
    if(!playList){
        throw new apiError(404,"Playlist not found")
    }
    if(!req.user._id.equals(playList.ownerId)){
        throw new apiError(403,"Unauthorized to delete playlist")
    }
    try {
        await PlayList.findByIdAndDelete(playListId)
        if(playList.exclusiveThumbnail){
            await deleteFromCloudinary(extractPublicId(playList.thumbnailUrl),"thumbnail")
        }
        res.status(200).json(new apiResponse(200,"Playlist deleted successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while deleting playlist")
    }
})

const addVideoToPlayList = asyncHandler(async (req, res) => {
    let playListId
    let videoId
    if(mongoose.isValidObjectId(req.body.playListId)){
        playListId = mongoose.Types.ObjectId.createFromHexString(req.body.playListId)
    }else{
        throw new apiError(400,"PlayList require to add video")
    }
    if(mongoose.isValidObjectId(req.body.videoId)){
        videoId = mongoose.Types.ObjectId.createFromHexString(req.body.videoId)
    }else{
        throw new apiError(400,"Video require to add to playlist")
    }
    const playList = await PlayList.findById(playListId)
    if(!playList){
        throw new apiError(404,"Playlist not found")
    }
    if(!req.user._id.equals(playList.ownerId)){
        throw new apiError(403,"Unauthorized to add video to playlist")
    }
    const video = await Video.findById(videoId)
    if(!video){
        throw new apiError(404,"Video not found")
    }
    if(playList.videos.includes(videoId)){
        throw new apiError(400,"Video already added to playlist")
    }
    if(req.type === "creatorplaylist"){
        if(!req.user._id.equals(video.owner)){
            throw new apiError(403,"Unauthorized to add video to playlist")
        }
    }
    try{
        const updatedPlayList = await PlayList.findByIdAndUpdate(playListId,{$addToSet:{videos:videoId}},{new:true})
        res.status(200).json(new apiResponse(200,updatedPlayList,"Video added to playlist successfully"))
    }catch(error){
        throw new apiError(500,"Something went wrong while adding video to playlist")
    } 
})

const removeVideoFromPlayList = asyncHandler(async (req, res) => {
    let playListId
    let videoId
    if(mongoose.isValidObjectId(req.body.playListId)){
        playListId = mongoose.Types.ObjectId.createFromHexString(req.body.playListId)
    }else{
        throw new apiError(400,"PlayList require to remove video")
    }
    if(mongoose.isValidObjectId(req.body.videoId)){
        videoId = mongoose.Types.ObjectId.createFromHexString(req.body.videoId)
    }else{
        throw new apiError(400,"Video require to remove from playlist")
    }
    const playList = await PlayList.findById(playListId)
    if(!playList){
        throw new apiError(404,"Playlist not found")
    }
    if(!req.user._id.equals(playList.ownerId)){
        throw new apiError(403,"Unauthorized to remove video from playlist")
    }
    try {
        const removed = await PlayList.findByIdAndUpdate(playListId,{$pull:{videos:videoId}},{new:true})
        res.status(200).json(new apiResponse(200,removed,"Video removed from playlist successfully"))
    } catch (error) {
        if(!await Video.findById(videoId)){
            throw new apiError(400,"Video does not exist")
        }else{
            throw new apiError(500,"Something went wrong while removing video from playlist")
        }
    }
})

const updatePlayList = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { 
        throw new apiError(400, "Invalid playlist id");
    }
    const playListId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const thumbnailLocal = req.file?.path || null
    let thumbnail
    let newThumbnailUploaded = false
    const playList = await PlayList.findById(playListId)
    if(!playList){
        throw new apiError(404,"Playlist not found")
    }
    const title = req.body.title || playList.title
    const description = req.body.description || playList.description
    if(!req.user._id.equals(playList.ownerId)){
        throw new apiError(403,"Unauthorized to update playlist")
    }
    if(thumbnailLocal){
        try {
            thumbnail = await uploadOnCloudinary(thumbnailLocal,"thumbnail")
            if(playList.exclusiveThumbnail){
                await deleteFromCloudinary(extractPublicId(playList.thumbnailUrl),"thumbnail")
            }
            newThumbnailUploaded = true
            thumbnail = thumbnail.url
        } catch (error) {
            if(thumbnail){
                await deleteFromCloudinary(extractPublicId(thumbnail),"thumbnail")
            }
            newThumbnailUploaded = false
            thumbnail = playList.thumbnailUrl
        }
    }
    try {
        const updatedPlayList = await PlayList.findByIdAndUpdate(playListId,{$set:{
            title:title,
            description:description,
            thumbnailUrl:thumbnail || playList.thumbnailUrl,
            exclusiveThumbnail:newThumbnailUploaded?true:playList.exclusiveThumbnail
        }},{new:true})
        res.status(200).json(new apiResponse(200,updatedPlayList,"Playlist updated successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while updating playlist")
    }
})

const getPlayList = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { 
        throw new apiError(400, "Invalid playlist id");
    }
    const playListId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const playList = await PlayList.findById(playListId)
    if(!playList){
        throw new apiError(404,"Playlist not found")
    }
    res.status(200).json(new apiResponse(200,playList))
})

const getAllPlayList = asyncHandler(async (req, res) => {
    const userId = req.user._id
    const playlists = await PlayList.find({ownerId:userId})
    if (playlists.length === 0) {
        throw new apiError(404, "No playlists found for this user");
    }
    res.status(200).json(new apiResponse(200,playlists))
})

export { createPlayList, addVideoToPlayList, removeVideoFromPlayList, updatePlayList, getPlayList, getAllPlayList, deletePlayList}