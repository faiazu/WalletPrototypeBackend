// src/services/baas/baasTypes.ts

import { BaasProviderName } from "../../generated/prisma/enums.js";

/**
 * Re-export the provider enum so other modules can import it from here if they want
 */
export { BaasProviderName };

/**
 * Divvi's own normalized event types (NOT provider event names).
 */
export type BaasEventType =
  | "CARD_AUTH"
  | "CARD_AUTH_REVERSAL"
  | "CARD_CLEARING"
  | "WALLET_FUNDING"
  | "KYC_VERIFICATION";

/**
 * Normalized shape for a card authorization event.
 * Used by CardProgramService to decide APPROVE/DECLINE and record pending auths.
 */
export interface NormalizedCardAuthEvent {
  provider: BaasProviderName;
  type: "CARD_AUTH";

  // Provider identifiers
  providerEventId: string;        // unique event id from provider (for idempotency)
  providerTransactionId: string;  // auth id / transaction id
  providerCardId: string;         // card token/id at provider
  providerCustomerId?: string;    // provider-level customer/account id

  // Money
  amountMinor: number;            // smallest currency unit (e.g., cents)
  currency: string;               // ISO code e.g., "CAD", "USD"

  // Merchant / context (for rules / analytics)
  merchantName?: string;
  merchantCategoryCode?: string;  // MCC as string, e.g. "5814"
  merchantCountry?: string;       // ISO country code if available
  network?: string;               // "VISA", "MASTERCARD", etc.
  isCardPresent?: boolean;        // card-present vs card-not-present
  isOnline?: boolean;             // ecommerce vs in-person

  // Timing
  occurredAt: Date;

  // Full raw provider payload (for audit/debug, not for core logic)
  rawPayload: unknown;
}

/**
 * Normalized shape for an auth reversal/void event.
 * Used to release/mark holds when provider reverses an authorization.
 */
export interface NormalizedCardAuthReversalEvent {
  provider: BaasProviderName;
  type: "CARD_AUTH_REVERSAL";

  providerEventId: string;
  providerAuthId: string;        // original auth id to reverse
  providerCardId: string;
  providerCustomerId?: string;

  amountMinor?: number;          // optional if provider sends amount on reversal
  currency?: string;

  occurredAt: Date;
  rawPayload: unknown;
}

/**
 * Normalized shape for a card clearing / settlement event.
 * This is what ultimately drives your internal ledger posting (postCardCapture).
 */
export interface NormalizedCardClearingEvent {
  provider: BaasProviderName;
  type: "CARD_CLEARING";

  providerEventId: string;        // unique event id from provider
  providerTransactionId: string;  // clearing/settlement transaction id
  providerAuthId?: string;        // original auth id, if linked
  providerCardId: string;
  providerCustomerId?: string;

  amountMinor: number;
  currency: string;

  merchantName?: string;
  merchantCategoryCode?: string;
  merchantCountry?: string;
  network?: string;
  isCardPresent?: boolean;
  isOnline?: boolean;

  occurredAt: Date;
  rawPayload: unknown;
}

/**
 * Normalized shape for an inbound funding event (ACH/Interac/etc.) into the program.
 * This is used to decide which wallet/user to credit and to post a deposit in the ledger.
 */
export interface NormalizedWalletFundingEvent {
  provider: BaasProviderName;
  type: "WALLET_FUNDING";

  providerEventId: string;        // unique event id from provider
  providerTransactionId: string;  // external transfer/transaction id
  providerAccountId: string;      // account at provider that received funds

  amountMinor: number;
  currency: string;

  // Used to route funds to the right wallet/user (varies by provider)
  reference?: string;             // memo/description/virtual account ref
  fundingMethod?: string;         // "ACH_CREDIT", "INTERAC", etc.

  occurredAt: Date;
  rawPayload: unknown;
}

/**
 * Unified union of all normalized events that BaasWebhookService can handle.
 */
export type NormalizedBaasEvent =
  | NormalizedCardAuthEvent
  | NormalizedCardAuthReversalEvent
  | NormalizedCardClearingEvent
  | NormalizedWalletFundingEvent
  | NormalizedKycVerificationEvent;

/**
 * Normalized shape for KYC verification status updates.
 */
export interface NormalizedKycVerificationEvent {
  provider: BaasProviderName;
  type: "KYC_VERIFICATION";

  providerEventId: string;
  personId: string;
  verificationStatus: string;
  rawPayload: unknown;
}

export type NormalizedSyncteraEvent =
  | NormalizedKycVerificationEvent;
