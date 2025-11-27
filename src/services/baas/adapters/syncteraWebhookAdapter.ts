import crypto from "crypto";
import type { Request } from "express";

import { config } from "../../../core/config.js";
import {
  BaasProviderName,
  type NormalizedBaasEvent,
  type NormalizedKycVerificationEvent,
} from "../baasTypes.js";

function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = config.synctera.webhookSecret;
  if (!secret || !signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function normalizeEvent(event: any): NormalizedBaasEvent {
  const type = event?.type ?? "UNKNOWN";

  if (type === "VERIFICATION_STATUS") {
    const normalized: NormalizedKycVerificationEvent = {
      provider: BaasProviderName.SYNCTERA,
      type: "KYC_VERIFICATION",
      providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
      personId: event?.data?.person_id ?? event?.person_id,
      verificationStatus:
        event?.data?.verification_status ?? event?.verification_status ?? "UNKNOWN",
      rawPayload: event,
    };
    return normalized;
  }

  return {
    provider: BaasProviderName.SYNCTERA,
    type: "KYC_VERIFICATION",
    providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
    personId: event?.data?.person_id ?? event?.person_id ?? "unknown",
    verificationStatus:
      event?.data?.verification_status ?? event?.verification_status ?? "UNKNOWN",
    rawPayload: event,
  } as NormalizedKycVerificationEvent;
}

export const syncteraWebhookAdapter = {
  verifySignature,
  normalizeEvent(req: Request): NormalizedBaasEvent {
    const rawBody =
      typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body));

    const signature = req.header("X-Tnsa-Signature") || req.header("x-tnsa-signature");
    if (!verifySignature(rawBody, signature)) {
      throw new Error("InvalidSignature");
    }

    const parsed =
      typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? JSON.parse(rawBody.toString())
        : req.body;

    return normalizeEvent(parsed);
  },
};
