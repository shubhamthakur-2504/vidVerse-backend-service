import { Video } from "../models/video.model.js";
import agenda from "../db/agendaSetup.js";
import { downloadFromCloudinary, uploadVideoChunksToCloudinary, deleteFromCloudinary } from "./cloudinary.js";
import { createVideoChunks } from "./utils.js";
import fs from 'fs';


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
