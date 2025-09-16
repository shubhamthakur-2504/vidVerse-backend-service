import { Video } from "../models/video.model.js";
import agenda from "../db/agendaSetup.js";
import { downloadFromCloudinary, uploadVideoChunksToCloudinary, deleteFromCloudinary } from "./cloudinary.js";
import { createVideoChunks } from "./utils.js";
import fs from 'fs';
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Tweet } from "../models/tweet.model.js";
import { View } from "../models/view.model.js";

agenda.define("process video chunks", async (job) => {
    console.log('Processing video chunks job started'); //to be removed after adding logs logger
    const { videoId } = job.attrs.data;
    console.log(`Processing video chunks for video ID: ${videoId}`); //to be removed after adding logs logger
    try {
        const video = await Video.findById(videoId);
        if (!video) return;
        
        const orignalVideoUrl = video.videoFileUrl;

        // Process the video chunks here
        console.log('Processing video for chunks'); //to be removed after adding logs logger
        const localPath = `public/temps/${videoId}.mp4`;
        await downloadFromCloudinary(video.videoFileUrl, localPath);
        console.log('Downloaded video from Cloudinary'); //to be removed after adding logs logger

        console.log('Creating video chunks'); //to be removed after adding logs logger
        const { manifestPath, chunkPaths, outputDir } = await createVideoChunks(localPath);
        console.log('Video chunks created'); //to be removed after adding logs logger

        console.log(`Uploading video chunks to Cloudinary for video ID: ${videoId}`); //to be removed after adding logs logger
        const uploadResponse = await uploadVideoChunksToCloudinary(chunkPaths, manifestPath, videoId);

        if (uploadResponse) {
            console.log('updating video in database with chunk paths'); //to be removed after adding logs logger
            video.videoFileUrl = uploadResponse; //  manifestPath is returned
            video.status = 'ready'
            await video.save();
            console.log('Video updated successfully'); //to be removed after adding logs logger
            await deleteFromCloudinary(orignalVideoUrl);
            console.log('Deleted video from Cloudinary'); //to be removed after adding logs logger
            fs.unlinkSync(localPath); // Clean up local file
            console.log('Deleted local file'); //to be removed after adding logs logger
            fs.rmSync(outputDir, { recursive: true }); // Clean up output directory
            console.log('Deleted output directory'); //to be removed after adding logs logger
        }else{
            console.log('Failed to upload video chunks to Cloudinary'); //to be removed after adding logs logger
            video.status = 'failed';
            await video.save();
            // Handle failure case, e.g., send notification or log error
        }
    } catch (error) {
        console.error('Error processing video chunks:', error); //to be removed after adding logs logger
        const video = await Video.findById(videoId);
        if (video) {
            video.status = 'failed';
            await video.save();
        }
    }
})
// in next update for video update the following
// change the fs.unlinksync and fs.rmsync to async version
// add multiple retries before marking as failed


agenda.define("validate like", async (job) => {
    console.log('Validating likes job started'); //to be removed after adding logs logger
    const { likeId } = job.attrs.data;
    console.log(`Validating like ID: ${likeId}`); //to be removed after adding logs logger
    try {
        const like = await Like.findById(likeId);
        if (!like) {
            console.log(`Like with ID ${likeId} not found`); //to be removed after adding logs logger
            return;
        }
        const targetId = like.targetId;
        const targetType = like.targetType;
        let targetModel;
        if (targetType === "Video") targetModel = Video;
        else if (targetType === "Tweet") targetModel = Tweet;
        else if (targetType === "Comment") targetModel = Comment;
        const target = await targetModel.findById(targetId);
        if (!target) {
            console.log(`${targetType} with ID ${targetId} not found. Deleting like.`); //to be removed after adding logs logger
            await Like.findByIdAndDelete(likeId);
            return;
        }
        console.log(`Like with ID ${likeId} is valid`); //to be removed after adding logs logger
    } catch (error) {
        console.error('Error validating like:', error); //to be removed after adding logs logger
    }
})
// in next update for like validation
// add bulk validation job to validate multiple likes at once
// make a collection of invalid likes and delete them in bulk

agenda.define("count views", async (job) => {
    console.log('Counting views job started');
    try {
        // Aggregate unprocessed views
        const viewCounts = await View.aggregate([
            { $match: { processed: false } },
            {
                $group: {
                    _id: { targetId: "$targetId", targetType: "$targetType" },
                    count: { $sum: 1 },
                    viewIds: { $push: "$_id" }
                }
            },
            { $limit: 1000 },
            { $project: { targetId: "$_id.targetId", targetType: "$_id.targetType", count: 1, viewIds: 1, _id: 0 } }
        ]);

        console.log(`Found ${viewCounts.length} targets with new views`);

        const bulkOps = { Video: [], Tweet: [] };
        let allViewIds = [];

        for (const vc of viewCounts) {
            const { targetId, targetType, count, viewIds } = vc;
            allViewIds.push(...viewIds);

            if (targetType === "Video" || targetType === "Tweet") {
                bulkOps[targetType].push({
                    updateOne: {
                        filter: { _id: targetId },
                        update: { $inc: { views: count } }
                    }
                });
            } else {
                console.log(`Unknown targetType: ${targetType}`);
            }
        }

        // Execute bulkWrite per target type
        for (const type of ["Video", "Tweet"]) {
            if (bulkOps[type].length > 0) {
                await (type === "Video" ? Video : Tweet).bulkWrite(bulkOps[type]);
                console.log(`Updated ${bulkOps[type].length} ${type} documents`);
            }
        }

        // Mark all processed views in one batch
        if (allViewIds.length > 0) {
            await View.updateMany(
                { _id: { $in: allViewIds } },
                { $set: { processed: true } }
            );
        }

        console.log('Views counting job completed');

    } catch (error) {
        console.error('Error counting views:', error);
    }
});
