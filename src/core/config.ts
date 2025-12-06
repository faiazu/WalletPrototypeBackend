import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string(),
  LOG_LEVEL: z.string().default("info"),

  // Synctera
  SYNCTERA_API_KEY: z.string(),
  SYNCTERA_BASE_URL: z.string().url(),
  SYNCTERA_WEBHOOK_SECRET: z.string(),
  SYNCTERA_ACCOUNT_TEMPLATE_ID: z.string(),
  SYNCTERA_CARD_PRODUCT_ID: z.string(),
  SYNCTERA_ACCOUNT_CURRENCY: z.string().default("USD"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[config] Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check required env vars.");
}

export type AppConfig = z.infer<typeof EnvSchema>;
export const config: AppConfig = parsed.data;

console.log(`[config] Loaded environment: env=${config.NODE_ENV}, logLevel=${config.LOG_LEVEL}`);
