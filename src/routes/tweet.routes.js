import { Router } from "express";
import { upload } from "../middleWares/multer.middleWare.js";
import { determineOrigin } from "../middleWares/type.middleWare.js";
import { createView as view } from "../middleWares/view.middleWare.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { lightVerifyJwtToken as lightauth } from "../middleWares/auth.middleWare.js";
import { createTweet, deleteTweet, updateTweet, getAllTweets, getTweetDetails } from "../controllers/tweet.controllers.js";
import { createComment, deleteComment, editComment, getAllComments, getCommentDetails, createrCommentDelete } from "../controllers/comment.controllers.js";
import { validateObjectIdParam } from "../middleWares/validateId.middleWare.js";
import { validate } from "../middleWares/validate.middleWare.js";
import { tweetSchema, commentSchema, listTweetsSchema, listCommentsSchema } from "../validators/index.js";

const router = Router()
router.param("id", validateObjectIdParam)

router.route("/getalltweet").get(validate(listTweetsSchema), getAllTweets)
router.route("/getallcomment/:id").get(determineOrigin,validate(listCommentsSchema), getAllComments)

router.route("/gettweet/:id").get(lightauth, determineOrigin, view, getTweetDetails)
router.route("/getcommentdetail/:id").get(determineOrigin,getCommentDetails)

router.route("/create").post(auth,upload.single("image"),validate(tweetSchema), createTweet)
router.route("/createcomment/:id").post(auth,determineOrigin,upload.none(),validate(commentSchema), createComment)

router.route("/updatetweet/:id").patch(auth,upload.none(),validate(tweetSchema), updateTweet)
router.route("/updatecomment/:id").patch(auth,determineOrigin,upload.none(),validate(commentSchema), editComment)

router.route("/delete/:id").delete(auth,deleteTweet)
router.route("/deletecomment/:id").delete(auth,determineOrigin,deleteComment)
router.route("/creatercommentdelete/:id").delete(auth,determineOrigin,createrCommentDelete)

export default router