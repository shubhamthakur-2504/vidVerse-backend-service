import { Router } from "express";
import { createTweet, deleteTweet, updateTweet, getAllTweets, getTweetDetails } from "../controllers/tweet.controllers";
import { upload } from "../middleWares/multer.middleWare";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare";
import { determineOrigin } from "../middleWares/type.middleWare";
import { createComment, deleteComment, editComment, getAllComments, getCommentDetails, createrCommentDelete } from "../controllers/comment.controllers";

const router = Router()

router.route("/getalltweet").get(getAllTweets)
router.route("/getallcomment").get(determineOrigin,getAllComments)

router.route("/gettweet/:id").get(getTweetDetails)
router.route("/getcommentdetalil/:id").get(determineOrigin,getCommentDetails)

router.route("/create").post(auth,upload.single("image"),createTweet)
router.route("/createcomment").post(auth,determineOrigin,createComment)

router.route("/updatetweet/:id").patch(auth,updateTweet)
router.route("/updatecomment/:id").patch(auth,determineOrigin,editComment)

router.route("/delete/:id").delete(auth,deleteTweet)
router.route("/deletecomment/:id").delete(auth,determineOrigin,deleteComment)
router.route("/creatercommentdelete/:id").delete(auth,determineOrigin,createrCommentDelete)

export default router