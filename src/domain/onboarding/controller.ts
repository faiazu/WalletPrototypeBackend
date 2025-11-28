import type { Request, Response } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { completeUserKyc } from "../../services/baas/synctera/kycOnboardingService.js";
import { kycSchema } from "./validator.js";

export const postKyc = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const input = kycSchema.parse(req.body);

      const kycInput = {
        ...input,
        disclosures: input.disclosures ?? [],
        customer_ip_address: input.customer_ip_address ?? "127.0.0.1",
      };

      const result = await completeUserKyc(userId, kycInput);

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
      return res
        .status(400)
        .json({ error: err?.message || "Failed to complete KYC onboarding" });
    }
  },
];
