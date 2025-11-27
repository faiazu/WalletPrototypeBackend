import express, { Router } from "express";

import { baasWebhookService } from "../core/dependencies.js";
import { mockWebhookAdapter } from "../services/baas/adapters/mockWebhookAdapter.js";

const router = Router();

// Use raw body to support signature verification / normalization from Buffer
router.use(
  express.raw({
    type: "*/*",
  })
);

const adapters: Record<string, typeof mockWebhookAdapter> = {
  mock: mockWebhookAdapter,
};

router.post("/:provider", async (req, res) => {
  const providerKey = req.params.provider?.toLowerCase();
  const adapter = providerKey ? adapters[providerKey] : undefined;

  if (!adapter) {
    return res.status(404).json({ error: "UnsupportedProvider" });
  }

  try {
    adapter.verifySignature(req);
  } catch (err: any) {
    console.warn(`[Webhook] Signature verification failed: ${err?.message ?? err}`);
    return res.status(401).json({ error: "InvalidSignature" });
  }

  try {
    const event = adapter.normalizeEvent(req);
    await baasWebhookService.handleNormalizedEvent(event);
    return res.status(200).json({ status: "ok" });
  } catch (err: any) {
    const message = err?.message ?? "WebhookProcessingFailed";
    console.error(`[Webhook] Processing error: ${message}`);

    if (message === "InvalidPayload") {
      return res.status(400).json({ error: "InvalidPayload" });
    }

    if (message === "UnsupportedEventType") {
      return res.status(400).json({ error: "UnsupportedEventType" });
    }

    return res.status(500).json({ error: "InternalError" });
  }
});

export { router as baasWebhookRouter };
