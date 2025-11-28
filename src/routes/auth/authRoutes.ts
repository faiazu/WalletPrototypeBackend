import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { prisma } from "../../core/db.js";
import { signAccessToken } from "../../core/jwt.js";
import { signInWithGoogle } from "../../services/auth/googleAuthService.js";

const router = Router();

const bodySchema = z.object({
  idToken: z.string().min(1),
});

// Google OAuth/OpenID: exchanges ID token for Divvi session
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { idToken } = bodySchema.parse(req.body);
    const result = await signInWithGoogle(idToken);
    return res.json(result);
  } catch (err: any) {
    console.error(err);
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body", details: err.errors });
    }
    return res.status(400).json({ error: err.message ?? "Authentication failed" });
  }
});

// DEV ONLY: create a token for a user by email (no password)
router.post("/debug-login", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const token = signAccessToken(user.id);
  return res.json({ user: { id: user.id, email: user.email }, token });
});

export { router as authRouter };
