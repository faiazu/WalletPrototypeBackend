import type { Request, Response } from "express";

import { Debugger } from "../../core/debugger.js";
import { baasWebhookService } from "../../core/dependencies.js";
import { syncteraWebhookAdapter } from "../../services/baas/adapters/syncteraWebhookAdapter.js";
import { mockWebhookAdapter } from "../../services/baas/adapters/mockWebhookAdapter.js";

/**
 * Handle Synctera webhook (POST /webhooks/synctera).
 */
export const handleSyncteraWebhook = async (req: Request, res: Response) => {
  try {
    const event = syncteraWebhookAdapter.normalizeEvent(req);

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
};

/**
 * Handle generic BaaS webhook (mock) (POST /webhooks/baas/:provider).
 */
export const handleBaasWebhook = async (req: Request, res: Response) => {
  const providerKey = req.params.provider?.toLowerCase();
  const adapters: Record<string, typeof mockWebhookAdapter> = {
    mock: mockWebhookAdapter,
  };
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
};
