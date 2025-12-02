import { z } from "zod";
import { BaasProviderName, WalletSpendPolicy } from "../../generated/prisma/client.js";

export const createWalletSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
});

export const inviteSchema = z.object({
  email: z.email(),
  role: z.string().optional(),
});

export const createFundingRouteSchema = z.object({
  providerName: z.nativeEnum(BaasProviderName),
  providerAccountId: z.string().min(1, "Provider account ID is required"),
  reference: z.string().optional(),
  userId: z.string().uuid("Valid user ID is required"),
  baasAccountId: z.string().optional(),
});

export const updateSpendPolicySchema = z.object({
  spendPolicy: z.nativeEnum(WalletSpendPolicy),
});
