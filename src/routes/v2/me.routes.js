import { Router } from "express";
import { upload } from "../../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth } from "../../middleWares/auth.middleWare.js";
import { authLimiter } from "../../middleWares/rateLimit.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { updateAccountSchema, changePasswordSchema, paginationSchema } from "../../validators/index.js";
import { getCurrentUser, updateAccountDetails, changeAvatar, changeCover, changeCurrentPassword } from "../../controllers/userRegister.controllers.js";
import { getWatchHistory, getUserChannelDetails } from "../../controllers/userDetails.controllers.js";
import { Mysubscriptions } from "../../controllers/subscription.controllers.js";
import { getMyVideos } from "../../controllers/video.controllers.js";
import { getStudioOverview, getMyVideo } from "../../controllers/studio.controllers.js";
import { removeFromWatchHistory, clearWatchHistory } from "../../controllers/library.controllers.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";

// /api/v2/me: the signed-in user
const router = Router();
router.param("videoId", validateObjectIdParam);
router.use(auth);

router.get("/", getCurrentUser);
router.patch("/", validate(updateAccountSchema), updateAccountDetails);
router.put("/avatar", upload.fields([{ name: "avatar", maxCount: 1 }]), changeAvatar);
router.put("/cover", upload.fields([{ name: "cover", maxCount: 1 }]), changeCover);
router.put("/password", authLimiter, validate(changePasswordSchema), changeCurrentPassword);

router.get("/stats", getUserChannelDetails);
router.get("/history", getWatchHistory);
router.delete("/history", clearWatchHistory);
router.delete("/history/:videoId", removeFromWatchHistory);
router.get("/subscriptions", validate(paginationSchema), Mysubscriptions);
router.get("/videos", getMyVideos);
router.get("/videos/:videoId", getMyVideo);
router.get("/studio", getStudioOverview);

export default router;
