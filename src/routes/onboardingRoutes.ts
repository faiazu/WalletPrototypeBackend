import express from "express";
import { z } from "zod";

import { authMiddleware } from "../core/authMiddleware.js";
import { completeUserKyc } from "../services/baas/synctera/kycOnboardingService.js";

const router = express.Router();

const addressSchema = z.object({
  address_line_1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country_code: z.string().length(2),
});

const disclosureSchema = z.object({
  type: z.string().min(1),
  version: z.string().min(1),
});

const kycSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  dob: z.string().min(1), // ISO date string
  phone_number: z.string().min(1),
  email: z.string().email(),
  ssn: z.string().min(1).optional(),
  legal_address: addressSchema,
  disclosures: z.array(disclosureSchema).optional(),
  customer_ip_address: z.string().min(1).optional(),
});

// POST /onboarding/kyc
router.post("/kyc", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const input = kycSchema.parse(req.body);

    const result = await completeUserKyc(userId, input);

    return res.status(200).json({
      personId: result.personId,
      verificationStatus: result.verificationStatus,
      user: {
        id: result.user.id,
        kycStatus: result.user.kycStatus,
      },
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid KYC payload", details: err.issues });
    }
    console.error("KYC onboarding error:", err);
    return res
      .status(400)
      .json({ error: err?.message || "Failed to complete KYC onboarding" });
  }
});

export { router as onboardingRouter };
