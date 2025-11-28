import { Router } from "express";

import { postKyc } from "./controller.js";

const router = Router();

router.post("/kyc", postKyc);

export { router as onboardingRoutes };
