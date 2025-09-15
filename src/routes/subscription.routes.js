import { Router } from "express";
import { subscribe, unsubscribe, subscribersCount, isSubscribed, Mysubscriptions } from "../controllers/subscription.controllers.js";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";

const router = Router() 

router.route("/subscribe/:id").post(auth,subscribe)
router.route("/unsubscribe/:id").delete(auth,unsubscribe)
router.route("/subscriberscount/:id").get(subscribersCount)
router.route("/issubscribed/:id").get(auth,isSubscribed)
router.route("/mysubscriptions").get(auth,Mysubscriptions)

export default router