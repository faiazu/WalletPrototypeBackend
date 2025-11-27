import express from "express";

import { Debugger } from "../core/debugger.js";
import { baasWebhookService } from "../core/dependencies.js";
import { syncteraWebhookAdapter } from "../services/baas/adapters/syncteraWebhookAdapter.js";

const router = express.Router();

// Use raw body for signature verification
router.use(
  express.raw({
    type: "*/*",
  })
);

router.post("/", async (req, res) => {
  try {
    const event = syncteraWebhookAdapter.normalizeEvent(req);

    // Concise log; toggle detailed payload logging with SYNCTERA_WEBHOOK_DEBUG=true
    if (event.type === "KYC_VERIFICATION") {
      const personId = (event as any).personId;
      const verificationStatus = (event as any).verificationStatus;
      Debugger.logInfo(
        `[SyncteraWebhook] type=${event.type}, providerEventId=${event.providerEventId}, personId=${personId}, verificationStatus=${verificationStatus}`
      );
    } else if (event.type === "ACCOUNT_STATUS") {
      const accountId = (event as any).providerAccountId;
      const status = (event as any).status;
      Debugger.logInfo(
        `[SyncteraWebhook] type=${event.type}, providerEventId=${event.providerEventId}, accountId=${accountId}, status=${status}`
      );
    } else if (event.type === "CARD_STATUS") {
      const cardId = (event as any).providerCardId;
      const status = (event as any).status;
      Debugger.logInfo(
        `[SyncteraWebhook] type=${event.type}, providerEventId=${event.providerEventId}, cardId=${cardId}, status=${status}`
      );
    } else {
      Debugger.logInfo(
        `[SyncteraWebhook] type=${event.type}, providerEventId=${event.providerEventId}`
      );
    }

    if (process.env.SYNCTERA_WEBHOOK_DEBUG === "true") {
      Debugger.logPayload("[SyncteraWebhook][DEBUG] Payload:", req.body);
    }

    await baasWebhookService.handleNormalizedEvent(event);
    return res.status(200).json({ status: "ok" });
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message === "InvalidSignature") {
      return res.status(401).json({ error: "InvalidSignature" });
    }
    Debugger.logError(`[SyncteraWebhook] Error: ${message}`);
    return res.status(400).json({ error: "WebhookProcessingFailed" });
  }
});

export { router as syncteraWebhookRouter };
