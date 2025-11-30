import type { Request, Response } from "express";

import { prisma } from "../../core/db.js";
import { signAccessToken } from "../../core/jwt.js";
import { signInWithGoogle } from "../../services/auth/googleAuthService.js";
import { ensureUserByEmail } from "../../services/user/userService.js";
import { debugLoginSchema, googleLoginSchema } from "./validator.js";
import { completeUserKyc } from "../../services/baas/synctera/kycOnboardingService.js";

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
  return res.json({
    user: { id: user.id, email: user.email, name: user.name || null },
    token,
  });
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
    return res.json({
      user: { id: user.id, email: user.email, name: user.name || null },
      token,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "Login failed" });
  }
};

// Demo login for Christopher Albertson: ensure user exists, ensure KYC, return token.
const DEMO_EMAIL = process.env.DEMO_LOGIN_EMAIL || "christopher.albertson@example.com";
const DEMO_NAME = process.env.DEMO_LOGIN_NAME || "Christopher Albertson";

const DEMO_KYC_PAYLOAD = {
  first_name: "Christopher",
  last_name: "Albertson",
  dob: "1985-06-14",
  phone_number: "+16045551212",
  email: DEMO_EMAIL,
  ssn: "456-78-9999",
  legal_address: {
    address_line_1: "123 Main St.",
    city: "Beverly Hills",
    state: "CA",
    postal_code: "90210",
    country_code: "US",
  },
  disclosures: [{ type: "REG_DD", version: "1.0" }],
  customer_ip_address: "184.233.47.237",
};

export const loginChristopher = async (_req: Request, res: Response) => {
  try {
    // Ensure user exists
    const user = await ensureUserByEmail(DEMO_EMAIL, DEMO_NAME);

    let currentUser = user;
    let kycStatus = currentUser.kycStatus || "UNKNOWN";
    let personId: string | undefined;

    if (kycStatus !== "ACCEPTED") {
      const result = await completeUserKyc(user.id, DEMO_KYC_PAYLOAD);
      kycStatus = result.verificationStatus;
      personId = result.personId;
      currentUser = result.user;
    }

    const token = signAccessToken(currentUser.id);

    return res.json({
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name || DEMO_NAME,
        kycStatus,
      },
      token,
      personId,
    });
  } catch (err: any) {
    return res.status(400).json({
      error: err?.message || "Failed to login Christopher",
    });
  }
};
