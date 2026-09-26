import { Video } from "../models/video.model.js";
import agenda from "../db/agendaSetup.js";
import { downloadFromCloudinary, uploadVideoChunksToCloudinary, deleteFromCloudinary, deleteCloudinaryFolder } from "./cloudinary.js";
import { createVideoChunks } from "./utils.js";
import fs from 'fs';
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Tweet } from "../models/tweet.model.js";
import { View } from "../models/view.model.js";
import { extractPublicId } from "./utils.js";

const MAX_PROCESSING_ATTEMPTS = 3

agenda.define("process video chunks", async (job) => {
    const { videoId, attempt = 1 } = job.attrs.data;
    console.log(`Processing video chunks for video ID: ${videoId} (attempt ${attempt})`); //to be removed after adding logs logger

    const video = await Video.findById(videoId);
    if (!video || video.status === "ready") return;

    const originalVideoUrl = video.videoFileUrl;
    const localPath = `public/temps/${videoId}.mp4`;
    let outputDir = null;
    try {
        await downloadFromCloudinary(originalVideoUrl, localPath);
        const chunks = await createVideoChunks(localPath);
        outputDir = chunks.outputDir;

        // throws if any segment or the manifest fails to upload
        const manifestUrl = await uploadVideoChunksToCloudinary(chunks.chunkPaths, chunks.manifestPath, videoId);

        // the video may have been deleted while it was being processed
        const updated = await Video.findOneAndUpdate(
            { _id: videoId },
            { $set: { videoFileUrl: manifestUrl, status: "ready" } },
            { new: true }
        );
        if (!updated) {
            await deleteCloudinaryFolder(`videos/${videoId}`);
            return;
        }
        await deleteFromCloudinary(extractPublicId(originalVideoUrl), "video"); // the original upload is a video asset, not the default image type
        console.log(`Video ${videoId} is ready`); //to be removed after adding logs logger
    } catch (error) {
        console.error(`Error processing video chunks for ${videoId}:`, error); //to be removed after adding logs logger
        // drop any segments uploaded before the failure so a retry starts clean
        await deleteCloudinaryFolder(`videos/${videoId}`).catch((err) => console.error("segment cleanup failed:", err));
        if (attempt < MAX_PROCESSING_ATTEMPTS) {
            await agenda.schedule(`in ${attempt * 2} minutes`, "process video chunks", { videoId, attempt: attempt + 1 });
        } else {
            await Video.updateOne({ _id: videoId }, { $set: { status: "failed" } });
        }
    } finally {
        // local work files are removed whether processing succeeded or not
        await fs.promises.rm(localPath, { force: true });
        if (outputDir) await fs.promises.rm(outputDir, { recursive: true, force: true });
    }
})


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
