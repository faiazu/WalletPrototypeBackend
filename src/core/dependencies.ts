// src/core/dependencies.ts

import { prisma } from "./db.js";

// Ledger
import { ledgerService } from "../services/ledger/ledgerService.js";

// BaaS outbound services (customer + card creation, funding, etc)
import { MockBaasClient } from "../services/baas/baasClient.js";
import { BaasService } from "../services/baas/baasService.js";
import { BaasProviderName } from "../generated/prisma/enums.js";
import { config } from "./config.js";

// Card Program (auth + clearing)
import { CardProgramService } from "../services/baas/cardProgramService.js";

// BaaS inbound webhook handling (webhooks: card auth, clearing, funding)
import { BaasWebhookService } from "../services/baas/baasWebhookService.js";

// Instantiate the low level BaaS HTTP client based on configured provider
const baasClient = (() => {
  switch (config.baasProvider) {
    case "MOCK":
      return new MockBaasClient();
    // case "STRIPE_ISSUING":
    //   return new StripeBaasClient(config.stripe.apiKey!);
    default:
      return new MockBaasClient();
  }
})();

// Map provider string to Prisma enum
const providerName =
  config.baasProvider === "STRIPE_ISSUING"
    ? BaasProviderName.STRIPE_ISSUING
    : BaasProviderName.MOCK;

// Instantiate the high level BaasService that knows about Prisma + provider
export const baasService = new BaasService(prisma, baasClient, providerName);

// Instantiate the CardProgramService
export const cardProgramService = new CardProgramService({
  prisma,
  ledger: {
    getWalletPoolBalance: ledgerService.getWalletPoolBalance.bind(ledgerService),
    postCardCapture: ledgerService.postCardCapture.bind(ledgerService),  
  }, // adapt the BaasService's ledgerService
});

// BaaS Webhook Service - used by provider webhook routes
export const baasWebhookService = new BaasWebhookService({
  prisma,
  cardProgramService,
  ledger: {
    postDeposit: ledgerService.postDeposit.bind(ledgerService),
  },
});


// future:
// export const walletService = new WalletService(prisma, ...);
// export const ledgerService = new LedgerService(prisma, ...);
