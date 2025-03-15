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

const uploadOnCloudinary = async function (localFilePath) {
    try {
        if(!localFilePath){
            console.log("File not found");  //to be removed after adding logs logger
            return null
            
        }

        let folder = '';
        if (fileType === 'avatar') {
            folder = 'avatars';
        } else if (fileType === 'cover') {
            folder = 'covers';
        } else if (fileType === 'video') {
            folder = 'videos';
        }

        const res = await cloudinary.uploader.upload(
            localFilePath,{
                resource_type:'auto',
                folder:folder
            }
        ) 
        console.log("File uploaded on Cloudinary. File Src : "+ res.url); //to be removed after adding logs logger
        fs.unlinkSync(localFilePath)
        return res
    } catch (error) {
        console.log("Cloudinary upload error::", error); //to be removed after adding logs logger
        fs.unlinkSync(localFilePath)
        return null
    }
}

const deleteFromCloudinary = async function (publicId) {
    try{
        if(!publicId){
            console.log("File not found"); //to be removed after adding logs logger
            return null
        }
        const res = await cloudinary.uploader.destroy(publicId)
        console.log("File deleted from Cloudinary. File Src : "+ res.result); //to be removed after adding logs logger
        return res
    }catch(error){
        console.log("Cloudinary delete error::", error); //to be removed after adding logs logger
    }
}

export {uploadOnCloudinary, deleteFromCloudinary}