import { Router } from "express";
import { upload } from "../middleWares/multer.middleWare.js";
import { determineOrigin } from "../middleWares/type.middleWare.js";
import { createView as view } from "../middleWares/view.middleWare.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { lightVerifyJwtToken as lightauth } from "../middleWares/auth.middleWare.js";
import { uploadVideo, deleteVideo ,getAllVideos, getVideoDetails, toggleIsPublished, updateVideoDetails, getMyVideos} from "../controllers/video.controllers.js";
import { createComment, deleteComment, editComment, getAllComments, createrCommentDelete, getCommentDetails } from "../controllers/comment.controllers.js";

const router = Router();
router.route("/upload").post(auth, upload.fields([
    {name:"video", maxCount:1},
    {name:"thumbnail", maxCount:1}
]), uploadVideo);

router.route("/delete/:videoId").delete(auth, deleteVideo);
router.route("/toggle/:videoId").patch(auth,toggleIsPublished);
router.route("/update/:videoId").patch(auth,upload.single("thumbnail"),updateVideoDetails)
router.route("/getmyvideos").get(auth,getMyVideos)

// unsecure routes for getting video details
router.route("/getallvideos").get(getAllVideos)
router.route("/getvideodetails/:videoId").get(lightauth, determineOrigin, view, getVideoDetails)
router.route("/getallcomments/:id").get(determineOrigin,getAllComments)
router.route("/getcommentdetail/:id").get(determineOrigin,getCommentDetails)



// routes for comments
router.route("/createcomment/:id").post(auth,determineOrigin,upload.none(),createComment)
router.route("/editcomment/:id").patch(auth,determineOrigin,upload.none(),editComment)
router.route("/deletecomment/:id").delete(auth,determineOrigin,deleteComment)
router.route("/creatercommentdelete/:id").delete(auth,determineOrigin,createrCommentDelete)


export default router