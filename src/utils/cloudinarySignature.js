import { v2 as cloudinary } from "cloudinary";
import { config } from "../config.js";

// Signed parameters that let the browser upload one video straight to Cloudinary storage, only under the
// public id chosen here. Cloudinary rejects the signature after about an hour.
export const signVideoUpload = (publicId) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, config.cloudinary.apiSecret);
    return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/video/upload`,
        cloudName: config.cloudinary.cloudName,
        apiKey: config.cloudinary.apiKey,
        publicId,
        timestamp,
        signature,
    };
};
