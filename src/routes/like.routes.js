import { Router } from "express";
import { toggleReaction, likeCount, getReaction } from "../controllers/like.controllers";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";

const router = Router();

router.post("/:id", auth, toggleReaction);
router.get("/:id/count", likeCount);
router.get("/:id", auth, getReaction);

export default router;