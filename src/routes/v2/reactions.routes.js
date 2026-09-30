import { Router } from "express";
import { verifyJwtToken as auth } from "../../middleWares/auth.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { apiError } from "../../utils/apiError.js";
import { setReactionSchema } from "../../validators/v2.js";
import { reactionFromParams, REACTION_TARGETS } from "./adapters.js";
import { toggleReaction, getReaction, removeReaction, likeCount } from "../../controllers/like.controllers.js";

// /api/v2/reactions/:targetType/:id   targetType = video | post | comment
const router = Router();
router.param("id", validateObjectIdParam);
router.param("targetType", (req, res, next, value) =>
    REACTION_TARGETS[value] ? next() : next(new apiError(400, "targetType must be video, post or comment"))
);

router.get("/:targetType/:id", auth, reactionFromParams, getReaction);
router.get("/:targetType/:id/count", reactionFromParams, likeCount);
router.put("/:targetType/:id", auth, validate(setReactionSchema), reactionFromParams, toggleReaction);
router.delete("/:targetType/:id", auth, reactionFromParams, removeReaction);

export default router;
