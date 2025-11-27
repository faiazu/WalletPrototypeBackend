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
    const personId = "personId" in event ? (event as any).personId : "n/a";
    const verificationStatus =
      "verificationStatus" in event ? (event as any).verificationStatus : "n/a";
    Debugger.logInfo(
      `[SyncteraWebhook] type=${event.type}, providerEventId=${event.providerEventId}, personId=${personId}, verificationStatus=${verificationStatus}`
    );

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
