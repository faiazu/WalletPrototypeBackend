import { Router } from "express";

import { debugLogin, emailLogin, googleLogin } from "./controller.js";

const router = Router();

router.post("/google", googleLogin);
router.post("/debug-login", debugLogin);
router.post("/login", emailLogin);

export { router as authRoutes };
