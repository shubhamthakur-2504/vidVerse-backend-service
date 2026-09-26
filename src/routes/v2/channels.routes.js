import { Router } from "express";
import { verifyJwtToken as auth, lightVerifyJwtToken as lightauth } from "../../middleWares/auth.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { apiError } from "../../utils/apiError.js";
import { channelVideosSchema } from "../../validators/v2.js";
import { getChannel, getChannelVideos } from "../../controllers/channel.controllers.js";
import { putSubscription, unsubscribe } from "../../controllers/subscription.controllers.js";

// /api/v2/channels: public channel pages (by user name) and subscriptions (by channel id)
const router = Router();
router.param("id", validateObjectIdParam);
router.param("userName", (req, res, next, value) =>
    /^[a-z0-9._-]{1,30}$/i.test(value) ? next() : next(new apiError(400, "Invalid userName")));

router.put("/:id/subscription", auth, putSubscription);
router.delete("/:id/subscription", auth, unsubscribe);

router.get("/:userName", lightauth, getChannel);
router.get("/:userName/videos", validate(channelVideosSchema), getChannelVideos);

export default router;
