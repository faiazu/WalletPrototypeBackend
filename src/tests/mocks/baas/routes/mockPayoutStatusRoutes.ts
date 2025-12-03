import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { baasWebhookService } from "../../../../core/dependencies.js";
import type { NormalizedWithdrawalStatusEvent } from "../../../../services/baas/baasTypes.js";
import { BaasProviderName } from "../../../../generated/prisma/enums.js";

const router = Router();

/**
 * POST /test/baas/payout-status
 * 
 * Trigger a mock PAYOUT_STATUS event for testing
 * Simulates provider webhook for withdrawal completion/failure
 */
const payoutStatusSchema = z.object({
  providerTransferId: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "REVERSED"]),
  failureReason: z.string().optional(),
  amountMinor: z.number().int().positive().optional(),
  currency: z.string().default("USD"),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { providerTransferId, status, failureReason, amountMinor, currency } =
      payoutStatusSchema.parse(req.body);

    const event: NormalizedWithdrawalStatusEvent = {
      provider: BaasProviderName.MOCK,
      type: "PAYOUT_STATUS",
      providerEventId: `mock_payout_status_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      providerTransferId,
      status,
      ...(failureReason && { failureReason }),
      rawPayload: { mock: true, triggeredViaTest: true },
    };

    await baasWebhookService.handleNormalizedEvent(event);

    return res.status(200).json({
      message: "PAYOUT_STATUS event processed",
      event: {
        providerEventId: event.providerEventId,
        providerTransferId: event.providerTransferId,
        status: event.status,
        failureReason: event.failureReason,
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
      error: "Failed to process payout status event",
      message: err.message || "Unknown error",
    });
  }
});

export { router as mockPayoutStatusRoutes };

