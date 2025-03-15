import { Router } from "express";
import { registerUser as userRegister } from "../controllers/userRegister.controllers.js";
import { upload } from "../middleWares/multer.middleWare.js"
import { login } from "../controllers/userRegister.controllers.js"
import { logout } from "../controllers/userRegister.controllers.js";
import {verifyJwtToken as auth} from "../middleWares/auth.middleWare.js"
import { refreshAccessToken } from "../controllers/userRegister.controllers.js";
import { changeCurrentPassword, changeAvatar, changeCover, updateAccountDetails, getCurrentUser } from "../controllers/userRegister.controllers.js"
import { getWatchHistory, getUserChannelDetails } from "../controllers/userDetails.controllers.js";

const router = Router()

router.route("/register").post(upload.fields([
    {name:"avatar", maxCount:1},
    {name:"cover", maxCount:1}
]),userRegister)

router.route("/login").post(async (req,res,next) => {
    await login(req,res,next) 
})

router.route("/refreshaccess").post(refreshAccessToken)

//secure routes
router.route("/logout").post(auth,logout)
router.route("/changepassword").post(auth,changeCurrentPassword)
router.route("/changeavatar").post( auth, upload.fields([{name:"avatar", maxCount:1}]),changeAvatar)
router.route("/changecover").post(auth, upload.fields([{name:"cover", maxCount:1}]),changeCover)
router.route("/updatedetails").post(auth,updateAccountDetails)
router.route("/getcurrentuser").get(auth,getCurrentUser)

router.route("/getwatchhistory").get(auth,getWatchHistory)
router.route("/getuserdetails").get(auth,getUserChannelDetails)


export default router