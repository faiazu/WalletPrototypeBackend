import express from "express";
import { z } from "zod";

import { ensureUserByEmail } from "../../../../services/user/userService.js";

const router = express.Router();

const registerSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
});

// mock register route to simulate user registration
// POST /test/auth/mock-register
router.post("/mock-register", async (req, res) => {
  try {
    const { email, name } = registerSchema.parse(req.body);

    const user = await ensureUserByEmail(email, name);

    return res.json({ user });
  } 
  catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid body", details: err.issues });
    }

    console.error("mock-register error:", err);
    return res.status(500).json({ error: "Failed to mock-register user" });
  }
});

export { router as mockRegisterRoutes };
