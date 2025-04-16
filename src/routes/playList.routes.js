import { Router } from "express";
import { createPlayList,addVideoToPlayList,removeVideoFromPlayList,updatePlayList,getPlayList,getAllPlayList,deletePlayList } from "../controllers/playList.controllers";
import { verifyJwtToken as auth } from "../middleWares/auth.middleWare.js";
import { upload } from "../middleWares/multer.middleWare.js";
import { determineOrigin } from "../middleWares/type.middleWare.js";

const router = Router() //need testing

router.route("/create/:id").post(auth,determineOrigin,upload.single("thumbnail"),createPlayList)
router.route("/addvideotoplaylist").post(auth,determineOrigin,upload.none(),addVideoToPlayList)
router.route("/removevideofromplaylist").post(auth,determineOrigin,upload.none(),removeVideoFromPlayList)

router.route("/updateplaylist/:id").patch(auth,determineOrigin,upload.single("thumbnail"),updatePlayList)

router.route("/getplaylist/:id").get(auth,determineOrigin,getPlayList)
router.route("/getallplaylist").get(auth,determineOrigin,getAllPlayList)

router.route("/deleteplaylist/:id").delete(auth,determineOrigin,deletePlayList) //need little refinment