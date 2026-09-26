import multer from "multer";
import {v4 as uuidv4} from "uuid";
import path from "path";
import { apiError } from "../utils/apiError.js";
import { config } from "../config.js";

// whole-byte limits from config (see config.js for why they must be integers)
const MAX_IMAGE_SIZE = config.uploads.maxImageBytes
const MAX_VIDEO_SIZE = config.uploads.maxVideoBytes

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]
// "video" is the only field that carries a video; every other file field is an image
const VIDEO_FIELDS = ["video"]

const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null, "./public/temps");
    },
    filename: function (req, file, cb){
        const extName = path.extname(file.originalname);
        const fileName =`${uuidv4()}${extName}`
        cb(null, fileName)
    }
})

// the mimetype comes from the client, so this blocks mistakes and casual abuse, not a determined attacker
const fileFilter = (req, file, cb) => {
    const allowed = VIDEO_FIELDS.includes(file.fieldname) ? VIDEO_TYPES : IMAGE_TYPES
    if (!allowed.includes(file.mimetype)) {
        return cb(new apiError(400, `Unsupported file type for "${file.fieldname}": ${file.mimetype || "unknown"}`))
    }
    cb(null, true)
}

// images only (avatar, cover, thumbnails, tweet images) and file-less multipart forms
export const upload = multer({
    storage: storage,
    fileFilter,
    limits: { fileSize: MAX_IMAGE_SIZE, files: 2 }
})

// video upload route only: allows a large video plus its optional thumbnail
export const videoUpload = multer({
    storage: storage,
    fileFilter,
    limits: { fileSize: MAX_VIDEO_SIZE, files: 2 }
})
