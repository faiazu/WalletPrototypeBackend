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
    // Debug: log raw payload as a string to inspect mapping issues
    try {
      const rawString = Buffer.isBuffer(req.body)
        ? req.body.toString()
        : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

      const parsed = JSON.parse(rawString);

      if (typeof parsed?.event_resource === "string") {
        try {
          parsed.event_resource = JSON.parse(parsed.event_resource);
        } catch {
          // leave as string
        }
      }
      if (typeof parsed?.event_resource_changed_fields === "string") {
        try {
          parsed.event_resource_changed_fields = JSON.parse(parsed.event_resource_changed_fields);
        } catch {
          // leave as string
        }
      }

      console.log("[SyncteraWebhook] Raw payload:", JSON.stringify(parsed, null, 2));
    } catch {
      const rawFallback = Buffer.isBuffer(req.body)
        ? req.body.toString()
        : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);
      console.log("[SyncteraWebhook] Raw payload (unparsed):", rawFallback);
    }

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
