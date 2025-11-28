import express, { type Application } from "express";

import { authRoutes } from "../domain/auth/routes.js";
import { userRoutes } from "../domain/user/routes.js";
import { walletRoutes } from "../domain/wallet/routes.js";
import { cardRoutes } from "../domain/cards/routes.js";
import { ledgerRoutes } from "../domain/ledger/routes.js";
import { onboardingRoutes } from "../domain/onboarding/routes.js";
import { baasRouter, syncteraRouter } from "../domain/webhooks/routes.js";

/**
 * Register webhook routes (mounted before express.json to preserve raw bodies).
 */
export function registerWebhookRoutes(app: Application) {
  app.use("/webhooks/baas", baasRouter);
  app.use("/webhooks/synctera", syncteraRouter);
}

/**
 * Register core API routes.
 */
export function registerApiRoutes(app: Application) {
  app.use(express.json());

  app.use("/auth", authRoutes);
  app.use("/user", userRoutes);
  app.use("/wallet", walletRoutes);
  app.use("/ledger", ledgerRoutes);
  app.use("/onboarding", onboardingRoutes);

  // Card routes (issue, widgets)
  app.use("/", cardRoutes);
}
