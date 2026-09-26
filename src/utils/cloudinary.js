import { v2 as cloudinary } from "cloudinary";
import fs from 'fs/promises'
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import axios from "axios";
import path from 'path';
import { config } from "../config.js";
import { logger } from "./logger.js";
// Configuration
cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret
});

const uploadLargeVideo = (filePath, folder) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_large(
            filePath,
            {
                resource_type: "video",
                folder,
                chunk_size: 6000000,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
    });
};

const uploadOnCloudinary = async function (localFilePath, fileType) {
    try {

        if (!localFilePath) {
            logger.warn("cloudinary helper called without a file")
            return null

        }
        let uploaderMethod = cloudinary.uploader.upload;
        let resourceType = 'auto';
        let folder = '';
        if (fileType === 'avatar') {
            folder = 'avatars';
        } else if (fileType === 'cover') {
            folder = 'covers';
        } else if (fileType === 'video') {
            folder = 'videos';
            resourceType = 'video';
        } else if (fileType === 'thumbnail') {
            folder = 'thumbnails'
        } else if (fileType === 'image') {
            folder = 'images'
        }

        if (resourceType === 'video') {
            const stats = await fs.stat(localFilePath);
            const fileSizeInMB = stats.size / (1024 * 1024);

            if (fileSizeInMB > 99) {
                const res = await uploadLargeVideo(localFilePath, folder);
                logger.debug({ url: res.secure_url }, "large video uploaded")
                if (res.secure_url) await fs.unlink(localFilePath);
                res.url = res.secure_url;
                return res;
            }
        }

        const res = await uploaderMethod(
            localFilePath, {
            resource_type: resourceType,
            folder: folder
        }
        )

        logger.debug({ url: res.secure_url }, "file uploaded")
        if (res && res.secure_url) {
            try {
                await fs.unlink(localFilePath);
            } catch (err) {
                logger.warn({ err, localFilePath }, "could not delete local file")
            }
        }
        res.url = res.secure_url;
        return res
    } catch (error) {
        logger.error({ err: error, localFilePath }, "cloudinary upload failed")
        await fs.unlink(localFilePath)
        return null
    }
}

const deleteFromCloudinary = async function (publicId, fileType = 'image') {
    try {
        if (!publicId) {
            logger.warn("cloudinary helper called without a file")
            return null
        }

        let deleteResponse;
        if (fileType === 'video') {
            deleteResponse = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        } else {
            deleteResponse = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        }

        if (deleteResponse.result === "ok") {
            logger.debug({ publicId }, "file deleted from cloudinary")
        } else {
            logger.warn({ publicId, result: deleteResponse.result }, "cloudinary delete did not succeed")
        }
        return deleteResponse
    } catch (error) {
        logger.error({ err: error, publicId }, "cloudinary delete failed")
    }
}

const downloadFromCloudinary = async (publicURL, localPath) => {
    const writer = createWriteStream(localPath)
    const response = await axios({
        url: publicURL,
        method: "GET",
        responseType: "stream",
    })

    try {
        await pipeline(response.data, writer);  
        return localPath;
    } catch (err) {
        try { await fs.unlink(localPath); } catch { /* the partial file may not exist */ }
        logger.error({ err, publicURL }, "download from cloudinary failed")
        throw err;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// retry transient Cloudinary failures (network blips, rate limits) with a short backoff
const uploadWithRetry = async (filePath, options, attempts = 3) => {
    for (let attempt = 1; ; attempt++) {
        try {
            return await cloudinary.uploader.upload(filePath, options)
        } catch (error) {
            if (attempt >= attempts) throw error
            await sleep(1000 * attempt)
        }
    }
}

// uploads every HLS segment, rewrites the manifest to point at the uploaded urls and uploads it
// throws if anything fails: a manifest with a missing segment would be marked ready but never play
const uploadVideoChunksToCloudinary = async (chunkPaths, manifestPath, videoId) => {
    if (!chunkPaths || chunkPaths.length === 0) {
        throw new Error("no HLS segments were produced")
    }
    const folder = `videos/${videoId}`
    const chunkUrlMap = {}
    for (const chunkPath of chunkPaths) {
        const res = await uploadWithRetry(chunkPath, { resource_type: "video", folder })
        chunkUrlMap[path.basename(chunkPath)] = res.secure_url
    }

    // segment references are whole lines in the playlist; replace line by line instead of a regex over the file
    const manifestLines = (await fs.readFile(manifestPath, "utf-8")).split(/\r?\n/)
    const rewritten = manifestLines.map((line) => {
        const name = line.trim()
        if (!name || name.startsWith("#")) return line
        if (!chunkUrlMap[name]) throw new Error(`manifest references a segment that was not uploaded: ${name}`)
        return chunkUrlMap[name]
    })
    await fs.writeFile(manifestPath, rewritten.join("\n"), "utf-8")

    const manifestRes = await uploadWithRetry(manifestPath, { resource_type: "raw", folder })
    return manifestRes.secure_url // real URL to play video
}
// delete every asset under a folder (e.g. the HLS segments + manifest in videos/<videoId>), then the folder itself
// the admin API deletes at most 1000 assets per call and reports `partial` when more remain
const deleteCloudinaryFolder = async (folder) => {
    if (!folder) return
    for (const resourceType of ["video", "raw", "image"]) {
        for (let page = 0; page < 20; page++) {
            const result = await cloudinary.api.delete_resources_by_prefix(`${folder}/`, { resource_type: resourceType })
            if (!result?.partial) break
        }
    }
    try {
        await cloudinary.api.delete_folder(folder)
    } catch (error) {
        // the folder may not exist (e.g. the video was never processed)
        if (error?.error?.http_code !== 404) throw error
    }
}

export { uploadOnCloudinary, deleteFromCloudinary, downloadFromCloudinary, uploadVideoChunksToCloudinary, deleteCloudinaryFolder };