import { Router } from "express";
import { upload } from "../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { uploadVideo, deleteVideo ,getAllVideos, getVideoDetails, toggleIsPublished, updateVideoDetails} from "../controllers/video.controllers.js";
import { createComment, deleteComment, editComment, getAllComments, createrCommentDelete } from "../controllers/comment.controllers.js";
import { determineOrigin } from "../middleWares/type.middleWare.js";

const router = Router();
router.route("/upload").post(auth, upload.fields([
    {name:"video", maxCount:1},
    {name:"thumbnail", maxCount:1}
]), uploadVideo);

router.route("/delete/:videoId").delete(auth, deleteVideo);
router.route("/toggle/:videoId").patch(auth,toggleIsPublished);
router.route("/update/:videoId").patch(auth,upload.single("thumbnail"),updateVideoDetails)


// unsecure routes for getting video details
router.route("/getallvideos").get(getAllVideos)
router.route("/getvideodetails/:videoId").get(getVideoDetails)
router.route("/getcomments/:id").get(determineOrigin,getAllComments)



// routes for comments
router.route("/createcomment/:id").post(auth,determineOrigin,upload.none(),createComment)
router.route("/editcomment/:id").patch(auth,determineOrigin,upload.none(),editComment)
router.route("/deletecomment/:id").delete(auth,determineOrigin,deleteComment)
router.route("/creatercommentdelete/:id").delete(auth,determineOrigin,createrCommentDelete)


export default router