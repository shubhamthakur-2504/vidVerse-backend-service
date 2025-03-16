import { v2 as cloudinary } from "cloudinary";
import fs from 'fs'
import dotenv from "dotenv";

// Configuration
dotenv.config({
    path:"./.env"
});
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret:process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async function (localFilePath, fileType) {
    try {
        if(!localFilePath){
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
        } else if(fileType === 'thumbnail'){
            folder = 'thumbnails'
        }

        const res = await cloudinary.uploader.upload(
            localFilePath,{
                resource_type:resourceType,
                folder:folder
            }
        ) 
        
        console.log("File uploaded on Cloudinary. File Src : "+ res.url); //to be removed after adding logs logger
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

const deleteFromCloudinary = async function (publicId,fileType = 'image') {
    try{
        if(!publicId){
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
    }catch(error){
        console.log("Cloudinary delete error::", error); //to be removed after adding logs logger
    }
}

export {uploadOnCloudinary, deleteFromCloudinary}