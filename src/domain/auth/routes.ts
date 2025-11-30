import { Router } from "express";

import { debugLogin, emailLogin, googleLogin, loginChristopher } from "./controller.js";

const router = Router();

router.post("/google", googleLogin);
router.post("/debug-login", debugLogin);
router.post("/login", emailLogin);
router.post("/login-christopher", loginChristopher);

export { router as authRoutes };
