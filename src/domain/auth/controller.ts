import type { Request, Response } from "express";

import { prisma } from "../../core/db.js";
import { signAccessToken } from "../../core/jwt.js";
import { signInWithGoogle } from "../../services/auth/googleAuthService.js";
import { ensureUserByEmail } from "../../services/user/userService.js";
import { debugLoginSchema, googleLoginSchema } from "./validator.js";

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { idToken } = googleLoginSchema.parse(req.body);
    const result = await signInWithGoogle(idToken);
    return res.json(result);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body", details: err.errors });
    }
    return res.status(400).json({ error: err.message ?? "Authentication failed" });
  }
};

// DEV ONLY: create a token for a user by email
export const debugLogin = async (req: Request, res: Response) => {
  const parsed = debugLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email required" });
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const token = signAccessToken(user.id);
  return res.json({ user: { id: user.id, email: user.email }, token });
};

// Email-only login: ensure user exists, return token
export const emailLogin = async (req: Request, res: Response) => {
  const parsed = debugLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email required" });
  }

  try {
    const { email } = parsed.data;
    const user = await ensureUserByEmail(email);
    const token = signAccessToken(user.id);
    return res.json({ user: { id: user.id, email: user.email }, token });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "Login failed" });
  }
};
