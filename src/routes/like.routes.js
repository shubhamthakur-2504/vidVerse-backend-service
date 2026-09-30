import { Router } from "express";
import { toggleReaction, likeCount, getReaction, removeReaction } from "../controllers/like.controllers.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { upload } from "../middleWares/multer.middleWare.js";
import { validateObjectIdParam } from "../middleWares/validateId.middleWare.js";
import { validate } from "../middleWares/validate.middleWare.js";
import { reactSchema, reactionTargetQuerySchema, reactionTargetBodySchema } from "../validators/index.js";

const router = Router();
router.param("id", validateObjectIdParam);

router.post("/:id", auth, upload.none(), validate(reactSchema), toggleReaction);
router.get("/:id/count", validate(reactionTargetQuerySchema), likeCount);
router.get("/:id", auth, validate(reactionTargetQuerySchema), getReaction);
router.delete("/:id", auth, upload.none(), validate(reactionTargetBodySchema), removeReaction);

export default router;
