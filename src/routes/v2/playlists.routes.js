import { Router } from "express";
import { upload } from "../../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth } from "../../middleWares/auth.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { withType } from "../../middleWares/type.middleWare.js";
import { updatePlaylistSchema } from "../../validators/index.js";
import { createPlaylistV2Schema } from "../../validators/v2.js";
import { playlistVideoFromBody, playlistVideoFromParams } from "./adapters.js";
import { createPlayList, getAllPlayList, getPlayList, updatePlayList, deletePlayList, addVideoToPlayList, removeVideoFromPlayList } from "../../controllers/playList.controllers.js";

// /api/v2/playlists: the signed-in user's playlists
const router = Router();
router.param("id", validateObjectIdParam);
router.param("videoId", validateObjectIdParam);
router.use(auth, withType("userplaylist"));

router.get("/", getAllPlayList);
router.post("/", upload.single("thumbnail"), validate(createPlaylistV2Schema), playlistVideoFromBody, createPlayList);
router.get("/:id", getPlayList);
router.patch("/:id", upload.single("thumbnail"), validate(updatePlaylistSchema), updatePlayList);
router.delete("/:id", deletePlayList);

router.put("/:id/videos/:videoId", playlistVideoFromParams, addVideoToPlayList);
router.delete("/:id/videos/:videoId", playlistVideoFromParams, removeVideoFromPlayList);

export default router;
