import { Router } from "express";
import authRouter from "./auth.routes.js";
import meRouter from "./me.routes.js";
import channelsRouter from "./channels.routes.js";
import videosRouter from "./videos.routes.js";
import postsRouter from "./posts.routes.js";
import commentsRouter from "./comments.routes.js";
import reactionsRouter from "./reactions.routes.js";
import playlistsRouter from "./playlists.routes.js";
import { healthCheck } from "../../controllers/healthCheck.controllers.js";

// /api/v2: resource-oriented routes (see docs/CODEBASE_REVIEW.md section 8.3)
const router = Router();

router.get("/health", healthCheck);
router.use("/auth", authRouter);
router.use("/me", meRouter);
router.use("/channels", channelsRouter);
router.use("/videos", videosRouter);
router.use("/posts", postsRouter);
router.use("/comments", commentsRouter);
router.use("/reactions", reactionsRouter);
router.use("/playlists", playlistsRouter);

export default router;
