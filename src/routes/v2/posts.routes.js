import { Router } from "express";
import { upload } from "../../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth, lightVerifyJwtToken as lightauth } from "../../middleWares/auth.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { withType } from "../../middleWares/type.middleWare.js";
import { createView as view } from "../../middleWares/view.middleWare.js";
import { tweetSchema, listTweetsSchema, commentSchema, listCommentsSchema } from "../../validators/index.js";
import { getAllTweets, createTweet, getTweetDetails, updateTweet, deleteTweet } from "../../controllers/tweet.controllers.js";
import { listCommentsWithStats, createComment } from "../../controllers/comment.controllers.js";

// /api/v2/posts: community posts (stored as tweets)
const router = Router();
router.param("id", validateObjectIdParam);
router.use(withType("tweet"));

router.get("/", validate(listTweetsSchema), getAllTweets);
router.post("/", auth, upload.single("image"), validate(tweetSchema), createTweet);
router.get("/:id", lightauth, view, getTweetDetails);
router.patch("/:id", auth, validate(tweetSchema), updateTweet);
router.delete("/:id", auth, deleteTweet);

router.get("/:id/comments", lightauth, validate(listCommentsSchema), listCommentsWithStats);
router.post("/:id/comments", auth, validate(commentSchema), createComment);

export default router;
