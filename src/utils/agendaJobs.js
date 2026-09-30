import { Video } from "../models/video.model.js";
import agenda from "../db/agendaSetup.js";
import path from "path";
import { downloadFromCloudinary, uploadFileForHls, uploadOnCloudinary, deleteFromCloudinary, deleteCloudinaryFolder } from "./cloudinary.js";
import { probeVideo, pickRenditions, transcodeToHls, publishHls, extractFrame } from "../services/hls.service.js";
import fs from 'fs';
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Tweet } from "../models/tweet.model.js";
import { View } from "../models/view.model.js";
import { extractPublicId } from "./utils.js";
import { logger } from "./logger.js";
import { notifyNewVideo } from "../services/notification.service.js";

const MAX_PROCESSING_ATTEMPTS = 3

agenda.define("process video chunks", async (job) => {
    const { videoId, attempt = 1 } = job.attrs.data;
    const log = logger.child({ job: "process video chunks", videoId: String(videoId), attempt });
    log.info("processing video")

    const video = await Video.findById(videoId);
    if (!video || video.status === "ready") return;

    const originalVideoUrl = video.videoFileUrl;
    const localPath = `public/temps/${videoId}.mp4`;
    const outputDir = path.join("public", "temps", `hls_${videoId}_${Date.now()}`);
    try {
        await downloadFromCloudinary(originalVideoUrl, localPath);

        // adaptive bitrate: every ladder rung up to the source height, in one ffmpeg pass
        const source = await probeVideo(localPath);
        const renditions = pickRenditions(source.height);
        log.info({ source, renditions: renditions.map((r) => r.name) }, "transcoding");
        const ladder = await transcodeToHls(localPath, outputDir, renditions, source.hasAudio);

        // throws if any segment or playlist fails to upload (each upload is retried)
        const masterUrl = await publishHls(ladder, `videos/${videoId}`, uploadFileForHls);

        // uploads without a custom thumbnail get a frame from the video
        const update = { videoFileUrl: masterUrl, status: "ready", duration: source.duration || video.duration };
        if (!video.thumbnailUrl) {
            const frame = await extractFrame(localPath, path.join(outputDir, "thumbnail.jpg"), Math.min(5, source.duration / 2));
            const thumbnail = await uploadOnCloudinary(frame, "thumbnail");
            if (!thumbnail) throw new Error("thumbnail upload failed");
            update.thumbnailUrl = thumbnail.url;
        }

        // the video may have been deleted while it was being processed
        const updated = await Video.findOneAndUpdate(
            { _id: videoId },
            { $set: update },
            { new: true }
        );
        if (!updated) {
            await deleteCloudinaryFolder(`videos/${videoId}`);
            return;
        }
        // the original upload is a video asset (not the default image type); direct uploads know their exact public id
        await deleteFromCloudinary(video.sourcePublicId ?? extractPublicId(originalVideoUrl), "video");
        log.info("video is ready")
        // private uploads stay quiet; subscribers only hear about videos they can watch
        if (updated.isPublished) await notifyNewVideo(updated)
    } catch (error) {
        log.error({ err: error }, "video processing failed")
        // drop any segments uploaded before the failure so a retry starts clean
        await deleteCloudinaryFolder(`videos/${videoId}`).catch((err) => log.error({ err }, "segment cleanup failed"));
        if (attempt < MAX_PROCESSING_ATTEMPTS) {
            await agenda.schedule(`in ${attempt * 2} minutes`, "process video chunks", { videoId, attempt: attempt + 1 });
        } else {
            await Video.updateOne({ _id: videoId }, { $set: { status: "failed" } });
        }
    } finally {
        // local work files are removed whether processing succeeded or not
        await fs.promises.rm(localPath, { force: true });
        await fs.promises.rm(outputDir, { recursive: true, force: true });
    }
})


agenda.define("validate like", async (job) => {
    const { likeId } = job.attrs.data;
    try {
        const like = await Like.findById(likeId);
        if (!like) {
            logger.debug({ job: "validate like", likeId }, "like already removed")
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
            logger.info({ job: "validate like", likeId, targetType, targetId }, "target missing, deleting like")
            await Like.findByIdAndDelete(likeId);
            return;
        }
    } catch (error) {
        logger.error({ job: "validate like", likeId, err: error }, "like validation failed")
    }
})
// in next update for like validation
// add bulk validation job to validate multiple likes at once
// make a collection of invalid likes and delete them in bulk

agenda.define("count views", async () => {
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

        logger.debug({ job: "count views", targets: viewCounts.length }, "aggregated new views")

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
                logger.warn({ job: "count views", targetType }, "unknown view target type")
            }
        }

        // Execute bulkWrite per target type
        for (const type of ["Video", "Tweet"]) {
            if (bulkOps[type].length > 0) {
                await (type === "Video" ? Video : Tweet).bulkWrite(bulkOps[type]);
                logger.info({ job: "count views", type, updated: bulkOps[type].length }, "view counts updated")
            }
        }

        // Mark all processed views in one batch
        if (allViewIds.length > 0) {
            await View.updateMany(
                { _id: { $in: allViewIds } },
                { $set: { processed: true } }
            );
        }


    } catch (error) {
        logger.error({ job: "count views", err: error }, "view counting failed")
    }
});
