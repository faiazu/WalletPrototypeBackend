import express, { type Application } from "express";

import { authRouter } from "./auth/authRoutes.js";
import { userRouter } from "./user/userRoutes.js";
import { walletRoutes } from "../domain/wallet/routes.js";
import { cardRouter } from "./cards/index.js";
import { baasWebhookRouter } from "./webhooks/baasWebhookRoutes.js";
import { ledgerRoutes } from "../domain/ledger/routes.js";
import { onboardingRouter } from "./onboarding/onboardingRoutes.js";
import { syncteraWebhookRouter } from "./webhooks/syncteraWebhookRoutes.js";

/**
 * Register webhook routes (mounted before express.json to preserve raw bodies).
 */
export function registerWebhookRoutes(app: Application) {
  app.use("/webhooks/baas", baasWebhookRouter);
  app.use("/webhooks/synctera", syncteraWebhookRouter);
}

/**
 * Register core API routes.
 */
export function registerApiRoutes(app: Application) {
  app.use(express.json());

  app.use("/auth", authRouter);
  app.use("/user", userRouter);
  app.use("/wallet", walletRoutes);
  app.use("/ledger", ledgerRoutes);
  app.use("/onboarding", onboardingRouter);

  // Card routes (issue, widgets)
  app.use("/", cardRouter);
}
