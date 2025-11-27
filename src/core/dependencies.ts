// src/core/dependencies.ts

import { prisma } from "./db.js";
import { MockBaasClient } from "../services/baas/baasClient.js";
import { BaasService } from "../services/baas/baasService.js";
import { BaasProviderName } from "../generated/prisma/enums.js";

// Instantiate the low level BaaS HTTP client (for now, the mock version)
const baasClient = new MockBaasClient();

// Instantiate the high level BaasService that knows about Prisma + provider
export const baasService = new BaasService(
  prisma,
  baasClient,
  BaasProviderName.MOCK
);

// future:
// export const walletService = new WalletService(prisma, ...);
// export const ledgerService = new LedgerService(prisma, ...);

