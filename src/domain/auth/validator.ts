import { z } from "zod";

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

export const debugLoginSchema = z.object({
  email: z.string().email(),
});
