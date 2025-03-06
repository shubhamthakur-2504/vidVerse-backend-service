import { Router } from "express";
import { registerUser as userRegister } from "../controllers/userRegister.controllers.js";
import { upload } from "../middleWares/multer.middleWare.js"
import { login } from "../controllers/userRegister.controllers.js"
import { logout } from "../controllers/userRegister.controllers.js";
import {verifyJwtToken as auth} from "../middleWares/auth.middleWare.js"
import { refreshAccessToken } from "../controllers/userRegister.controllers.js";

const router = Router()

router.route("/register").post(upload.fields([
    {name:"avatar", maxCount:1},
    {name:"cover", maxCount:1}
]),userRegister)

router.route("/login").post(async (req,res,next) => {
    await login(req,res,next)
    console.log(req.body);
    
})

router.route("/refreshaccess").post(refreshAccessToken)

//secure routes
router.route("/logout").post(auth,logout)


export default router