import { z } from "zod";

export const createWalletSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

