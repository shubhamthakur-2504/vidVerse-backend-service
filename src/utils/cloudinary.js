import { v2 as cloudinary } from "cloudinary";
import fs from 'fs/promises'
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import dotenv from "dotenv";
import axios from "axios";
import path from 'path';
// Configuration
dotenv.config({
    path: "./.env"
});
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
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
        console.log(localFilePath);

        if (!localFilePath) {
            console.log("File not found");  //to be removed after adding logs logger
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
        console.log("uploading");

        if (resourceType === 'video') {
            const stats = await fs.stat(localFilePath);
            const fileSizeInMB = stats.size / (1024 * 1024);

            if (fileSizeInMB > 99) {
                console.log("Using upload_large for chunked upload.");
                const res = await uploadLargeVideo(localFilePath, folder);
                console.log("Uploaded:", res.secure_url);
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

        console.log("File uploaded on Cloudinary. File Src : " + res.secure_url); //to be removed after adding logs logger
        if (res && res.secure_url) {
            try {
                await fs.unlink(localFilePath);
            } catch (err) {
                console.error("Error deleting local file:", err);
            }
        }
        res.url = res.secure_url;
        return res
    } catch (error) {
        console.log("Cloudinary upload error::", error); //to be removed after adding logs logger
        await fs.unlink(localFilePath)
        return null
    }
}

const deleteFromCloudinary = async function (publicId, fileType = 'image') {
    try {
        if (!publicId) {
            console.log("File not found"); //to be removed after adding logs logger
            return null
        }

        let deleteResponse;
        if (fileType === 'video') {
            deleteResponse = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        } else {
            deleteResponse = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        }

        if (deleteResponse.result === "ok") {
            console.log("File deleted from Cloudinary. File Src : " + publicId); // to be removed after adding logs logger
        } else {
            console.log("Failed to delete file from Cloudinary. File Src : " + publicId); //to be removed after adding logs logger
        }
        return deleteResponse
    } catch (error) {
        console.log("Cloudinary delete error::", error); //to be removed after adding logs logger
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
        try { await fs.unlink(localPath); } catch (_) {}
        console.error("Download pipeline error:", err);
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