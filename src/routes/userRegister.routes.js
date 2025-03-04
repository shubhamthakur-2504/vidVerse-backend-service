import { Router } from "express";
import { registerUser as userRegister } from "../controllers/userRegister.controllers.js";
import { upload } from "../middleWares/multer.middleWare.js"

const router = Router()

router.route("/register").post(upload.fields([
    {name:"avatar", maxCount:1},
    {name:"cover", maxCount:1}
]),async (req,res,next)=>{
    await userRegister(req,res,next)
})


export default router