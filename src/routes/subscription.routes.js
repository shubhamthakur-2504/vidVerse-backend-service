import { Router } from "express";
import {
    subscribe,
    unsubscribe,
    subscribersCount,
    isSubscribed,
    Mysubscriptions,
} from "../controllers/subscription.controllers.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { validateObjectIdParam } from "../middleWares/validateId.middleWare.js";
import { validate } from "../middleWares/validate.middleWare.js";
import { paginationSchema } from "../validators/index.js";

const router = Router();
router.param("id", validateObjectIdParam);

router.route("/subscribe/:id").post(auth, subscribe);
router.route("/unsubscribe/:id").delete(auth, unsubscribe);
router.route("/subscriberscount/:id").get(subscribersCount);
router.route("/issubscribed/:id").get(auth, isSubscribed);
router.route("/mysubscriptions").get(auth, validate(paginationSchema), Mysubscriptions);

export default router;
