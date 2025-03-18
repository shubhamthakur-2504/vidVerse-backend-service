import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Video } from "../models/video.model.js";
import { Tweet } from "../models/tweet.model.js";
import { Comment } from "../models/comment.model.js";
import { getCreatedAtDiffField, formatRelativeTime, isEdited } from "../utils/utils.js";
// common functions
const getModel= (type) => {
    if (type === 'video') {
        return Video
    } else if (type === 'tweet') {
       return Tweet
    } else {
        throw new apiError(400, "Invalid type. Must be 'video' or 'tweet'.")
    }
}

// create a comment on video or tweet
const createComment = asyncHandler(async (req, res) => {
    const {content} = req.body
    const type = req?.type
    const id = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const userId = req.user._id
    const model = getModel(type)

    if(!content?.trim()){
        throw new apiError(400,"content is required")
    }
    
    const instance  = await model.findById(id)
    if(!instance ){
        throw new apiError(404,`${type == "video" ? "Video" : "Tweet"} not found`)
    }
    try{
        const comment = await Comment.create({
            content:content,
            userId:userId
        })

        if (type == 'video') {
            comment.videoId = id
        }else{
            comment.tweetId = id
        }
        if((comment.videoId.equals(id)) || (comment.tweetId.equals(id))){
            await comment.save({validateBeforeSave:false})
            comment.editStatus = isEdited(comment.createdAt,comment.updatedAt)
            res.status(200).json(new apiResponse(200,comment,"Comment created successfull"))
        }else{
            await Comment.findByIdAndDelete(comment._id)
            throw new apiError(500, "fail to create a comment")
        }
    }catch(error){
        throw new apiError(500,"Something went wrong while creating comment")
    }
})

const deleteComment = asyncHandler(async (req, res) =>{
    const commentId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const comment = await Comment.findById(commentId)
    if(!comment){
        throw new apiError(404,"Comment not found")
    }
    if(!comment.userId.equals(req.user._id)){
        throw new apiError(403,"Unauthorized to delete this comment")
    }
    try {
        const deletedComment = await Comment.findByIdAndDelete(commentId);

        if (!deletedComment) {
            throw new apiError(500, "Failed to delete the comment");
        }
        res.status(200).json(new apiResponse(200,"Comment deleted successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while deleting comment")
    }
})

const getAllComments = asyncHandler(async (req, res) => {
    const type = req.type
    const id =  mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const model = getModel(type)
    const key = type === "video" ? "videoId" : "tweetId"
    
    const instance = await model.findById(id)
    
    if(!instance){
        throw new apiError(404,`${type == "video" ? "Video" : "Tweet"} not found`)
    }
    try {
        const allComment = await Comment.aggregate([
            {
                $match:{
                    [key]:id
                }
            },
            {
                $lookup:{
                    from:"users",
                    localField:"userId",
                    foreignField:"_id",
                    as:"userDetails"
                }
            },
            {
                $unwind:{
                    path:"$userDetails",
                    preserveNullAndEmptyArrays:true
                }
                
            },
            getCreatedAtDiffField(),
            {
                $project:{
                    content:1,
                    createdAtDiff:1,
                    createdAt:1,
                    updatedAt:1,
                    "userDetails.userName":1,
                    "userDetails.avatarUrl":1
                }
            }
        ])
        if(allComment.length === 0){
            res.status(200).json(new apiResponse(200,allComment,"No comments found"))
        }

        const formatedComment = allComment.map(comment => {
            comment.editStatus = isEdited(comment.createdAt,comment.updatedAt)
            comment.relativeTime = formatRelativeTime(comment.createdAtDiff)
            delete comment.createdAtDiff
            delete comment.updatedAt
            delete comment.createdAt
            return comment
        })

        res.status(200).json(new apiResponse(200,formatedComment,"Comment fetched successfully"))
        
    } catch (error) {
        throw new apiError(500,"Something went wrong while fetching comments")
    }
})

const editComment = asyncHandler(async (req, res) => {
    const commentId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const {content} = req.body

    if(!content?.trim()){
        throw new apiError(400, "Content cannot be empty")
    }
    const comment = await Comment.findById(commentId)

    if(!comment){
        throw new apiError(404, "Comment not found")
    }
    if(!comment.userId.equals(req.user._id)){
        throw new apiError(403, "Unauthorized to edit")
    }
    try {
        comment.content = content
        await comment.save({validateBeforeSave:false})
        res.status(200).json(new apiResponse(200,comment,"Comment edited successfully"))
    } catch (error) {
        throw new apiError(500,"Something went wrong while editing comment")
    }

})

const createrCommentDelete = asyncHandler(async (req, res) => {
    const commentId = mongoose.Types.ObjectId.createFromHexString(req.params.id)
    const type = req.type
    const model = getModel(type)
    const comment = await Comment.findById(commentId)

    if(!comment){
        throw new apiError(404,"Comment not found")
    }

    const instanceId = type === "video" ? comment.videoId : comment.tweetId;
    if (!instanceId) {
        throw new apiError(400, "Invalid comment reference");
    }

    const instance = await model.findById(instanceId)
    if (!instance) {
        throw new apiError(404, `${type === "video" ? "Video" : "Tweet"} not found`);
    }

    if(!instance.owner.equals(req.user._id)){
        throw new apiError(403, "Unauthorized to delete comment")
    }

    const deletedComment = await Comment.findByIdAndDelete(commentId)
    if(!deletedComment){
        throw new apiError(500,"Something went wrong")
    }
    res.status(200).json(new apiResponse(200,"Comment deleted successfully"))
    
}) 


export{createComment, deleteComment, getAllComments, editComment, createrCommentDelete}