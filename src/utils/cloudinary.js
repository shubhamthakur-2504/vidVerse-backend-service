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

const uploadVideoChunksToCloudinary = async (chunkPaths, manifestPath, videoId) => {
    if (!chunkPaths || chunkPaths.length === 0) {
        console.log("File not found");  //to be removed after adding logs logger
        return null
    }
    const folder = `videos/${videoId}`
    const resourceType = 'video';
    const chunkUrlMap = {};
    for (const chunkPath of chunkPaths) {
        try {
            const res = await cloudinary.uploader.upload(
                chunkPath, {
                resource_type: resourceType,
                folder: folder
            }
            )
            const fileName = path.basename(chunkPath);
            chunkUrlMap[fileName] = res.secure_url;
            try {
                await fs.unlink(chunkPath);
            } catch (err) {
                console.error("Error deleting local chunk file:", err); //to be removed after adding logs logger
            }
        } catch (error) {
            console.log("Cloudinary upload error::", error); //to be removed after adding logs logger
        }
    }
    try {
        let manifestContent = await fs.readFile(manifestPath, 'utf-8');
        for (const [fileName, fileUrl] of Object.entries(chunkUrlMap)) {
            manifestContent = manifestContent.replace(new RegExp(fileName, 'g'), fileUrl);
        }
        await fs.writeFile(manifestPath, manifestContent, 'utf-8');
    } catch (err) {
        console.error("Error updating manifest file:", err);
        return null;
    }
    try {
        const manifestRes = await cloudinary.uploader.upload(manifestPath, {
            resource_type: "raw",
            folder: folder
        });
        console.log("Manifest uploaded:", manifestRes.secure_url);

        await fs.unlink(manifestPath);
        return manifestRes.secure_url; // real URL to play video
    } catch (err) {
        console.error("Manifest upload error:", err);
        return null;
    }
}
export { uploadOnCloudinary, deleteFromCloudinary, downloadFromCloudinary, uploadVideoChunksToCloudinary };