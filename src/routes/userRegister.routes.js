import { Router } from "express";
import { registerUser as userRegister } from "../controllers/userRegister.controllers.js";
import { upload } from "../middleWares/multer.middleWare.js"
import { login } from "../controllers/userRegister.controllers.js"
import { logout } from "../controllers/userRegister.controllers.js";
import {verifyJwtToken as auth} from "../middleWares/auth.middleWare.js"
import { refreshAccessToken } from "../controllers/userRegister.controllers.js";
import { changeCurrentPassword, changeAvatar, changeCover, updateAccountDetails, getCurrentUser } from "../controllers/userRegister.controllers.js"
import { getWatchHistory, getUserChannelDetails } from "../controllers/userDetails.controllers.js";
import { authLimiter } from "../middleWares/rateLimit.middleWare.js";

const router = Router()

// rate limits run before multer so a rejected request never writes files
router.route("/register").post(authLimiter, upload.fields([
    {name:"avatar", maxCount:1},
    {name:"cover", maxCount:1}
]),userRegister)

router.route("/login").post(authLimiter, login)

router.route("/refreshaccess").post(refreshAccessToken)

//secure routes
router.route("/logout").post(auth,logout)
router.route("/changepassword").patch(auth,authLimiter,changeCurrentPassword)
router.route("/changeavatar").patch( auth, upload.fields([{name:"avatar", maxCount:1}]),changeAvatar)
router.route("/changecover").patch(auth, upload.fields([{name:"cover", maxCount:1}]),changeCover)
router.route("/updatedetails").patch(auth,updateAccountDetails)

router.route("/getcurrentuser").get(auth,getCurrentUser)
router.route("/getwatchhistory").get(auth,getWatchHistory)
router.route("/getuserdetails").get(auth,getUserChannelDetails)


export default router