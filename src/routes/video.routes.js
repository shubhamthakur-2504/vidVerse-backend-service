import { Router } from "express";
import { upload } from "../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { uploadVideo, deleteVideo ,getAllVideos, getVideoDetails} from "../controllers/video.controllers.js";

const router = Router();
router.route("/upload").post(auth, upload.fields([
    {name:"video", maxCount:1},
    {name:"thumbnail", maxCount:1}
]), uploadVideo);

router.route("/delete/:videoId").delete(auth, deleteVideo);


// unsecure routes for getting video details
router.route("/getallvideos").get(getAllVideos)
router.route("/getvideodetails/:videoId").get(getVideoDetails)

export default router