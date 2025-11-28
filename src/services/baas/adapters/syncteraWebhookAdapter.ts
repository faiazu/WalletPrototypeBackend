import crypto from "crypto";
import type { Request } from "express";

import { config } from "../../../core/config.js";
import {
  BaasProviderName,
  type NormalizedBaasEvent,
  type NormalizedKycVerificationEvent,
  type NormalizedAccountStatusEvent,
  type NormalizedCardStatusEvent,
} from "../baasTypes.js";

// Verify Synctera webhook signature:
// - Signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex encoded.
// - Header may contain multiple signatures separated by '.' during rotation.
// - Reject if older than 5 minutes (anti-replay).
function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined
): boolean {
  const secret = config.synctera.webhookSecret;
  if (!secret || !signatureHeader || !timestampHeader) return false;

  const reqTs = Number(timestampHeader);
  if (!Number.isFinite(reqTs)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (reqTs + 300 < nowSec) return false; // older than 5 minutes

  const baseString = `${timestampHeader}.${rawBody.toString()}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(baseString);
  const expected = hmac.digest("hex");

  const provided = signatureHeader.split(".");
  return provided.some((sig) => {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  });
}

// Normalize raw Synctera webhook payload into our Baas event shape.
function normalizeEvent(event: any): NormalizedBaasEvent {
  const type = event?.type ?? "UNKNOWN";
  const resourceType = typeof type === "string" ? type.split(".")[0] : "UNKNOWN";

  // PERSON-related events: use resource_id/data/event_resource fields (avoid deprecated event_resource)
  if (resourceType === "PERSON") {
    const resourceVerification =
      event?.event_resource?.verification_status ??
      event?.event_resource?.data?.verification_status;
    const personId =
      event?.resource_id ??
      event?.data?.person_id ??
      event?.person_id ??
      "unknown";
    const verificationStatus =
      resourceVerification ??
      event?.data?.verification_status ??
      event?.verification_status ??
      "UNKNOWN";

    const normalized: NormalizedKycVerificationEvent = {
      provider: BaasProviderName.SYNCTERA,
      type: "KYC_VERIFICATION",
      providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
      personId,
      verificationStatus,
      rawPayload: event,
    };
    return normalized;
  }

  if (resourceType === "ACCOUNT") {
    const providerAccountId =
      event?.resource_id ??
      event?.data?.account_id ??
      event?.account_id ??
      "unknown";
    const normalized: NormalizedAccountStatusEvent = {
      provider: BaasProviderName.SYNCTERA,
      type: "ACCOUNT_STATUS",
      providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
      providerAccountId,
      status: event?.data?.status ?? event?.status,
      accessStatus: event?.data?.access_status ?? event?.access_status,
      rawPayload: event,
    };
    return normalized;
  }

  if (resourceType === "CARD") {
    const providerCardId =
      event?.resource_id ??
      event?.data?.card_id ??
      event?.card_id ??
      "unknown";
    const normalized: NormalizedCardStatusEvent = {
      provider: BaasProviderName.SYNCTERA,
      type: "CARD_STATUS",
      providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
      providerCardId,
      status: event?.data?.status ?? event?.status,
      rawPayload: event,
    };
    return normalized;
  }

  // Default fallback
  return {
    provider: BaasProviderName.SYNCTERA,
    type: "KYC_VERIFICATION",
    providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
    personId: event?.resource_id ?? "unknown",
    verificationStatus:
      event?.event_resource?.verification_status ??
      event?.data?.verification_status ??
      event?.verification_status ??
      "UNKNOWN",
    rawPayload: event,
  } as NormalizedKycVerificationEvent;
}

export const syncteraWebhookAdapter = {
  verifySignature,
  normalizeEvent(req: Request): NormalizedBaasEvent {
    // Grab raw body (router uses express.raw)
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    // Signature + timestamp headers
    const signature = req.header("Synctera-Signature") || req.header("synctera-signature");
    const timestamp = req.header("Request-Timestamp") || req.header("request-timestamp");
    if (!verifySignature(rawBody, signature, timestamp)) {
      throw new Error("InvalidSignature");
    }

    // Parse JSON
    const parsed = Buffer.isBuffer(req.body)
      ? JSON.parse(rawBody.toString())
      : typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    return normalizeEvent(parsed);
  },
};
