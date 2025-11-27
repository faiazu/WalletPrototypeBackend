import type { Request } from "express";

import { BaasProviderName } from "../../../generated/prisma/enums.js";
import type { NormalizedBaasEvent } from "../baasTypes.js";

/**
 * Mock adapter:
 *  - No signature verification needed.
 *  - Expects a JSON body already parsed (or parses from raw Buffer).
 *  - Maps generic fields to NormalizedBaasEvent for the mock provider.
 */
export const mockWebhookAdapter = {
  verifySignature(_req: Request): void {
    // No-op for mock provider
  },

  normalizeEvent(req: Request): NormalizedBaasEvent {
    const body = typeof req.body === "string" || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body;

    if (!body || typeof body !== "object") {
      throw new Error("InvalidPayload");
    }

    const type = body.type;

    if (type === "CARD_AUTH") {
      return {
        provider: BaasProviderName.MOCK,
        type: "CARD_AUTH",
        providerEventId: body.id ?? body.eventId ?? "unknown_auth_event",
        providerTransactionId: body.txId ?? body.transactionId ?? "unknown_tx",
        providerCardId: body.cardId ?? body.providerCardId,
        providerCustomerId: body.customerId ?? body.providerCustomerId,
        amountMinor: body.amountMinor ?? body.amount ?? 0,
        currency: body.currency ?? "CAD",
        merchantName: body.merchantName,
        merchantCategoryCode: body.merchantCategoryCode,
        merchantCountry: body.merchantCountry,
        network: body.network,
        isCardPresent: body.isCardPresent,
        isOnline: body.isOnline,
        occurredAt: new Date(body.occurredAt ?? body.createdAt ?? Date.now()),
        rawPayload: body,
      };
    }

    if (type === "CARD_CLEARING") {
      return {
        provider: BaasProviderName.MOCK,
        type: "CARD_CLEARING",
        providerEventId: body.id ?? body.eventId ?? "unknown_clearing_event",
        providerTransactionId: body.txId ?? body.transactionId ?? "unknown_tx",
        providerAuthId: body.authId ?? body.providerAuthId,
        providerCardId: body.cardId ?? body.providerCardId,
        providerCustomerId: body.customerId ?? body.providerCustomerId,
        amountMinor: body.amountMinor ?? body.amount ?? 0,
        currency: body.currency ?? "CAD",
        merchantName: body.merchantName,
        merchantCategoryCode: body.merchantCategoryCode,
        merchantCountry: body.merchantCountry,
        network: body.network,
        isCardPresent: body.isCardPresent,
        isOnline: body.isOnline,
        occurredAt: new Date(body.occurredAt ?? body.createdAt ?? Date.now()),
        rawPayload: body,
      };
    }

    if (type === "WALLET_FUNDING") {
      return {
        provider: BaasProviderName.MOCK,
        type: "WALLET_FUNDING",
        providerEventId: body.id ?? body.eventId ?? "unknown_funding_event",
        providerTransactionId: body.txId ?? body.transactionId ?? "unknown_tx",
        providerAccountId: body.accountId ?? body.providerAccountId ?? "unknown_account",
        amountMinor: body.amountMinor ?? body.amount ?? 0,
        currency: body.currency ?? "CAD",
        reference: body.reference,
        fundingMethod: body.fundingMethod,
        occurredAt: new Date(body.occurredAt ?? body.createdAt ?? Date.now()),
        rawPayload: body,
      };
    }

    throw new Error("UnsupportedEventType");
  },
};
