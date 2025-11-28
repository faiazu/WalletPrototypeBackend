import { Router } from "express";

import { debugLogin, googleLogin } from "./controller.js";

const router = Router();

router.post("/google", googleLogin);
router.post("/debug-login", debugLogin);

export { router as authRoutes };
