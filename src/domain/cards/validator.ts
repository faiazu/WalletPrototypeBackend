import { z } from "zod";

export const issueCardParamsSchema = z.object({
  walletId: z.string().min(1),
});

export const issueCardBodySchema = z.object({
  nickname: z.string().trim().min(1).max(64).optional(),
});

export const widgetQuerySchema = z.object({
  widgetType: z.enum(["activate_card", "set_pin"]).optional(),
});

export const updateCardStatusSchema = z.object({
  status: z.enum(["ACTIVE", "LOCKED", "CANCELED", "SUSPENDED"]).optional(),
});

export const updateCardNicknameSchema = z.object({
  nickname: z.string().trim().min(1).max(64),
});
