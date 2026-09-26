import { Router } from "express";
import { verifyJwtToken as auth } from "../../middleWares/auth.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { commentSchema } from "../../validators/index.js";
import { getCommentDetails, editComment, removeComment } from "../../controllers/comment.controllers.js";

// /api/v2/comments: a single comment, wherever it was posted (listing and creating live under the video / post)
const router = Router();
router.param("id", validateObjectIdParam);

router.get("/:id", getCommentDetails);
router.patch("/:id", auth, validate(commentSchema), editComment);
router.delete("/:id", auth, removeComment);

export default router;
