import dotenv from "dotenv";

dotenv.config();

export type BaasProvider = "MOCK" | "STRIPE_ISSUING";

const baasProviderEnv = process.env.BAAS_PROVIDER?.toUpperCase() as BaasProvider | undefined;

export const config = {
  env: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  baasProvider: baasProviderEnv || "MOCK",
  stripe: {
    apiKey: process.env.STRIPE_API_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
};

if (!config.databaseUrl) {
  console.warn("[config] DATABASE_URL is not set. Prisma may fail to connect.");
}

console.log(`[config] Loaded environment: env=${config.env}, baasProvider=${config.baasProvider}`);
