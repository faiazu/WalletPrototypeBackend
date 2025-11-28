import { z } from "zod";

export const createWalletSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
});

export const inviteSchema = z.object({
  email: z.email(),
  role: z.string().optional(),
});
