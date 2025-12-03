import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { baasWebhookService } from "../../../../core/dependencies.js";
import type { NormalizedWalletFundingEvent } from "../../../../services/baas/baasTypes.js";
import { BaasProviderName } from "../../../../generated/prisma/enums.js";

const router = Router();

/**
 * POST /test/baas/funding
 * 
 * Trigger a mock WALLET_FUNDING event for testing
 * Simulates inbound ACH/funding to a wallet
 */
const fundingSchema = z.object({
  providerAccountId: z.string(),
  amountMinor: z.number().int().positive(),
  currency: z.string().default("USD"),
  reference: z.string().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { providerAccountId, amountMinor, currency, reference } = fundingSchema.parse(req.body);

    const event: NormalizedWalletFundingEvent = {
      provider: BaasProviderName.MOCK,
      type: "WALLET_FUNDING",
      providerEventId: `mock_funding_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      providerTransactionId: `mock_tx_${Date.now()}`,
      providerAccountId,
      amountMinor,
      currency,
      reference: reference ?? "",
      fundingMethod: "ACH_CREDIT",
      occurredAt: new Date(),
      rawPayload: { mock: true, triggeredViaTest: true },
    };

    await baasWebhookService.handleNormalizedEvent(event);

    return res.status(200).json({
      message: "WALLET_FUNDING event processed",
      event: {
        providerEventId: event.providerEventId,
        providerTransactionId: event.providerTransactionId,
        providerAccountId: event.providerAccountId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        reference: event.reference,
      },
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        error: "Invalid request body",
        details: err.errors,
      });
    }

    return res.status(500).json({
      error: "Failed to process funding event",
      message: err.message || "Unknown error",
    });
  }
});

export { router as mockFundingRoutes };

