import { Router } from "express";
import { upload } from "../../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth, lightVerifyJwtToken as lightauth } from "../../middleWares/auth.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { withType } from "../../middleWares/type.middleWare.js";
import { updatePlaylistSchema } from "../../validators/index.js";
import { createPlaylistV2Schema, myPlaylistsSchema } from "../../validators/v2.js";
import { playlistVideoFromBody, playlistVideoFromParams } from "./adapters.js";
import { createPlayList, updatePlayList, deletePlayList, addVideoToPlayList, removeVideoFromPlayList } from "../../controllers/playList.controllers.js";
import { getMyPlaylists, getPlaylistWithVideos } from "../../controllers/library.controllers.js";

// /api/v2/playlists: a public playlist page, and the signed-in user's playlists
const router = Router();
router.param("id", validateObjectIdParam);
router.param("videoId", validateObjectIdParam);
// playlists are public; the viewer (if signed in) also sees their own non-public videos in it
router.get("/:id", lightauth, getPlaylistWithVideos);

router.use(auth, withType("userplaylist"));

router.get("/", validate(myPlaylistsSchema), getMyPlaylists);
router.post("/", upload.single("thumbnail"), validate(createPlaylistV2Schema), playlistVideoFromBody, createPlayList);
router.patch("/:id", upload.single("thumbnail"), validate(updatePlaylistSchema), updatePlayList);
router.delete("/:id", deletePlayList);

router.put("/:id/videos/:videoId", playlistVideoFromParams, addVideoToPlayList);
router.delete("/:id/videos/:videoId", playlistVideoFromParams, removeVideoFromPlayList);

export default router;
