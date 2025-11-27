import crypto from "crypto";
import type { Request } from "express";

import { config } from "../../../core/config.js";
import {
  BaasProviderName,
  type NormalizedBaasEvent,
  type NormalizedKycVerificationEvent,
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

  // PERSON-related events: use resource_id/data fields (avoid deprecated event_resource)
  if (resourceType === "PERSON") {
    let personId =
      event?.resource_id ??
      event?.data?.person_id ??
      event?.person_id ??
      "unknown";
    let verificationStatus =
      event?.data?.verification_status ??
      event?.verification_status ??
      "UNKNOWN";

    // Fallback: parse deprecated event_resource if status/id missing
    if (
      (verificationStatus === "UNKNOWN" || personId === "unknown") &&
      typeof event?.event_resource === "string"
    ) {
      try {
        const parsed = JSON.parse(event.event_resource);
        if (personId === "unknown" && parsed?.id) {
          personId = parsed.id;
        }
        if (verificationStatus === "UNKNOWN" && parsed?.verification_status) {
          verificationStatus = parsed.verification_status;
        }
      } catch {
        // ignore parse errors
      }
    }

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

  // Default fallback
  return {
    provider: BaasProviderName.SYNCTERA,
    type: "KYC_VERIFICATION",
    providerEventId: event?.id ?? event?.event_id ?? crypto.randomUUID(),
    personId: event?.resource_id ?? "unknown",
    verificationStatus:
      event?.data?.verification_status ?? event?.verification_status ?? "UNKNOWN",
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
