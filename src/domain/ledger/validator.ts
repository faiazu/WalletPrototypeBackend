import { z } from "zod";

export const amountSchema = z.object({
  amount: z.number().int().positive("Amount must be a positive integer (minor units)"),
  metadata: z.any().optional(),
});

export const cardCaptureSchema = z.object({
  splits: z
    .array(
      z.object({
        userId: z.string().min(1),
        amount: z.number().int().positive(),
      })
    )
    .min(1, "At least one split is required"),
  metadata: z.any().optional(),
});

export const adjustmentSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().int().positive(),
  metadata: z.any().optional(),
});

export const walletParamSchema = z.object({
  walletId: z.string().min(1),
});
