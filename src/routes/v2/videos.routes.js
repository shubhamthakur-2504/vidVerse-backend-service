import { Router } from "express";
import { upload, videoUpload } from "../../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth, lightVerifyJwtToken as lightauth } from "../../middleWares/auth.middleWare.js";
import { uploadLimiter } from "../../middleWares/rateLimit.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { withType } from "../../middleWares/type.middleWare.js";
import { createView as view } from "../../middleWares/view.middleWare.js";
import { listVideosSchema, uploadVideoSchema, commentSchema, listCommentsSchema } from "../../validators/index.js";
import { updateVideoV2Schema, relatedVideosSchema, createFromUploadSchema } from "../../validators/v2.js";
import { createUploadIntent, createVideoFromUpload } from "../../controllers/directUpload.controllers.js";
import { getAllVideos, getCategories, uploadVideo, updateVideoDetails, deleteVideo, recordView } from "../../controllers/video.controllers.js";
import { listCommentsWithStats, createComment } from "../../controllers/comment.controllers.js";
import { getWatchPayload, getRelatedVideos } from "../../controllers/watch.controllers.js";

// /api/v2/videos
const router = Router();
router.param("videoId", validateObjectIdParam);
router.use(withType("video"));

router.get("/", validate(listVideosSchema), getAllVideos);
router.get("/categories", getCategories);
// direct upload (preferred): signed browser -> Cloudinary upload, then register it
router.post("/upload-intent", auth, uploadLimiter, createUploadIntent);
router.post("/from-upload", auth, upload.single("thumbnail"), validate(createFromUploadSchema), createVideoFromUpload);
// upload through this server (multipart), kept for small files and older clients
router.post("/", auth, uploadLimiter, videoUpload.fields([{ name: "video", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), validate(uploadVideoSchema), uploadVideo);

router.get("/:videoId", lightauth, getWatchPayload);
router.get("/:videoId/related", validate(relatedVideosSchema), getRelatedVideos);
router.patch("/:videoId", auth, upload.single("thumbnail"), validate(updateVideoV2Schema), updateVideoDetails);
router.delete("/:videoId", auth, deleteVideo);

router.post("/:videoId/views", lightauth, view, recordView);

// comments reuse controllers that read req.params.id
const toId = (req, res, next) => { req.params.id = req.params.videoId; next(); };
router.get("/:videoId/comments", lightauth, toId, validate(listCommentsSchema), listCommentsWithStats);
router.post("/:videoId/comments", auth, toId, validate(commentSchema), createComment);

export default router;
