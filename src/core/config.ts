import dotenv from "dotenv";

dotenv.config();

export type BaasProvider = "MOCK" | "STRIPE_ISSUING" | "SYNCTERA";

const baasProviderEnv = process.env.BAAS_PROVIDER?.toUpperCase() as BaasProvider | undefined;

export const config = {
  env: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  baasProvider: baasProviderEnv || "MOCK",
  stripe: {
    apiKey: process.env.STRIPE_API_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  synctera: {
    apiKey: process.env.SYNCTERA_API_KEY,
    baseUrl: process.env.SYNCTERA_BASE_URL || "https://api-sandbox.synctera.com/v0",
    webhookSecret: process.env.SYNCTERA_WEBHOOK_SECRET,
    accountTemplateId: process.env.SYNCTERA_ACCOUNT_TEMPLATE_ID,
    cardProductId: process.env.SYNCTERA_CARD_PRODUCT_ID,
    defaultAccountCurrency: process.env.SYNCTERA_ACCOUNT_CURRENCY || "USD",
  },
};

if (!config.databaseUrl) {
  console.warn("[config] DATABASE_URL is not set. Prisma may fail to connect.");
}

console.log(`[config] Loaded environment: env=${config.env}, baasProvider=${config.baasProvider}`);
