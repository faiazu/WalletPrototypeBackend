import { Router } from "express";
import { login, register, loginChristopher } from "./controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/login-christopher", loginChristopher);

export { router as authRoutes };

