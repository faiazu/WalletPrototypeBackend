import express from "express";
import { z } from "zod";

import { ensureUserByEmail } from "../../../../domain/user/service.js";
import { issueTokenForUser } from "../../../../domain/auth/service.js";

const router = express.Router();

const loginSchema = z.object({
  email: z.email(),
  name: z.string().min(1).optional(),
});

// POST /test/auth/mock-login
router.post("/mock-login", async (req, res) => {
  try {
    const { email } = loginSchema.parse(req.body);

    const user = await ensureUserByEmail(email);

    const token = issueTokenForUser(user.id);

    return res.json({ user, token });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid body", details: err.issues });
    }

    console.error("mock-login error:", err);
    return res.status(500).json({ error: "Failed to mock-login user" });
  }
});

export { router as mockLoginRoutes };
