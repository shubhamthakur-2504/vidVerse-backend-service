import { Router } from "express";
import { toggleReaction, likeCount, getReaction, removeReaction } from "../controllers/like.controllers.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { upload } from "../middleWares/multer.middleWare.js";
import { validateObjectIdParam } from "../middleWares/validateId.middleWare.js";

const router = Router();
router.param("id", validateObjectIdParam)

router.post("/:id", auth, upload.none(),toggleReaction);
router.get("/:id/count", likeCount);
router.get("/:id", auth, getReaction);
router.delete("/:id", auth, upload.none(),removeReaction);

export default router;