import { z } from "zod";

export const createCardSchema = z.object({
  holderUserId: z.string().uuid(),
  type: z.enum(["VIRTUAL", "PHYSICAL"]),
  brand: z.string().optional(),
  cardholderName: z.string().min(1),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD", "INR"]).default("CAD"),
  last4: z.string().length(4),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(new Date().getFullYear()).max(2100),
  widgetTypes: z.array(z.string()).default(["activate_card", "set_pin"]),
});

