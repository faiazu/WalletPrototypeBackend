import express from "express";

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
    await baasWebhookService.handleNormalizedEvent(event);
    return res.status(200).json({ status: "ok" });
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message === "InvalidSignature") {
      return res.status(401).json({ error: "InvalidSignature" });
    }
    console.error("[SyncteraWebhook] Error:", message);
    return res.status(400).json({ error: "WebhookProcessingFailed" });
  }
});

export { router as syncteraWebhookRouter };
