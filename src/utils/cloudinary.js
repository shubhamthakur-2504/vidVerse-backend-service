import { v2 as cloudinary } from "cloudinary";
import fs from 'fs'
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

const uploadOnCloudinary = async function (localFilePath, fileType) {
    try {
        if (!localFilePath) {
            console.log("File not found");  //to be removed after adding logs logger
            return null

        }
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

        const res = await cloudinary.uploader.upload(
            localFilePath, {
            resource_type: resourceType,
            folder: folder
        }
        )

        console.log("File uploaded on Cloudinary. File Src : " + res.url); //to be removed after adding logs logger
        try {
            fs.unlinkSync(localFilePath);
        } catch (err) {
            console.error("Error deleting local file:", err); //to be removed after adding logs logger
        }

        return res
    } catch (error) {
        console.log("Cloudinary upload error::", error); //to be removed after adding logs logger
        fs.unlinkSync(localFilePath)
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
    const writer = fs.createWriteStream(localPath)
    const response = await axios({
        url: publicURL,
        method: "GET",
        responseType: "stream",
    })
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
    })
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
                fs.unlinkSync(chunkPath);
            } catch (err) {
                console.error("Error deleting local chunk file:", err); //to be removed after adding logs logger
            }
        } catch (error) {
            console.log("Cloudinary upload error::", error); //to be removed after adding logs logger
        }
    }
    try {
        let manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        for (const [fileName, fileUrl] of Object.entries(chunkUrlMap)) {
            manifestContent = manifestContent.replace(new RegExp(fileName, 'g'), fileUrl);
        }
        fs.writeFileSync(manifestPath, manifestContent, 'utf-8');
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

        fs.unlinkSync(manifestPath);
        return manifestRes.secure_url; // real URL to play video
    } catch (err) {
        console.error("Manifest upload error:", err);
        return null;
    }
}
export { uploadOnCloudinary, deleteFromCloudinary, downloadFromCloudinary, uploadVideoChunksToCloudinary };