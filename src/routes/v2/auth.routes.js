import { Router } from "express";
import { upload } from "../../middleWares/multer.middleWare.js";
import { verifyJwtToken as auth } from "../../middleWares/auth.middleWare.js";
import { authLimiter } from "../../middleWares/rateLimit.middleWare.js";
import { validate } from "../../middleWares/validate.middleWare.js";
import { validateObjectIdParam } from "../../middleWares/validateId.middleWare.js";
import { registerSchema, loginSchema } from "../../validators/index.js";
import { userNameAvailabilitySchema } from "../../validators/v2.js";
import { registerUser, login, logout, refreshAccessToken, checkUserNameAvailability } from "../../controllers/userRegister.controllers.js";
import { listSessions, revokeSessionById, revokeOtherSessionsForUser } from "../../controllers/session.controllers.js";

// /api/v2/auth
const router = Router();
router.param("sessionId", validateObjectIdParam);

router.post("/register", authLimiter, upload.fields([{ name: "avatar", maxCount: 1 }, { name: "cover", maxCount: 1 }]), validate(registerSchema), registerUser);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/refresh", refreshAccessToken);
// public and read-only; covered by the general rate limit (the register form checks as the user types)
router.get("/username-availability", validate(userNameAvailabilitySchema), checkUserNameAvailability);
router.post("/logout", auth, logout);

// devices signed in to this account
router.get("/sessions", auth, listSessions);
router.delete("/sessions/others", auth, revokeOtherSessionsForUser);
router.delete("/sessions/:sessionId", auth, revokeSessionById);

export default router;
