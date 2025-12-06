import express, { type Application } from "express";

import { authRoutes } from "./domain/auth/routes.js";
import { userRoutes } from "./domain/user/routes.js";
import { walletRoutes } from "./domain/wallet/routes.js";
import { cardRoutes } from "./domain/cards/routes.js";

/**
 * Register core API routes.
 */
export function registerApiRoutes(app: Application) {
  app.use(express.json());

  app.use("/auth", authRoutes);
  app.use("/user", userRoutes);
  app.use("/wallets", walletRoutes);
  app.use("/", cardRoutes);
}
