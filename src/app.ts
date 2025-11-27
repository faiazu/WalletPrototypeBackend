import express, { type Application, type Request, type Response } from "express";
import cors from "cors";

import "./core/config.js";
// Routes
import { authRouter } from "./routes/authRoutes.js";
import { userRouter } from "./routes/userRoutes.js";
import { walletRouter } from "./routes/walletRoutes.js";
import { cardRouter } from "./routes/cardRoutes.js";
import { baasWebhookRouter } from "./routes/baasWebhookRoutes.js";
import { ledgerRouter } from "./routes/ledgerRoutes.js";
import { onboardingRouter } from "./routes/onboardingRoutes.js";
import { syncteraWebhookRouter } from "./routes/syncteraWebhookRoutes.js";

// Mock ledger routes for testing
import { mockLedger } from "./tests/mocks/ledger/mockLedgerIndex.js";
import { mockAuth } from "./tests/mocks/auth/mockAuthIndex.js";
import { mockBaas } from "./tests/mocks/baas/mockBaasIndex.js";

export function createApp(): Application {
  const app = express();

  app.use(cors());

  // Webhooks need raw body (before express.json) to allow signature verification
  app.use("/webhooks/baas", baasWebhookRouter);

  app.use(express.json());

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Auth routes (ex POST /auth/google)
  app.use("/auth", authRouter);

  // User routes (ex GET /user/me)
  app.use("/user", userRouter);

  // Wallet routes (create/invite/join/get)
  app.use("/wallet", walletRouter);

  // Ledger routes (real, non-mock)
  app.use("/ledger", ledgerRouter);

  // Onboarding routes (KYC, etc.)
  app.use("/onboarding", onboardingRouter);

  // Synctera webhook
  app.use("/webhooks/synctera", syncteraWebhookRouter);

  // Card routes (create cards for users)
  app.use("/", cardRouter);

  // Mock ledger routes for testing
  if (process.env.NODE_ENV !== "production") {
    // Use mock ledger routes under /test/ledger/*
    app.use("/test/ledger/deposit", mockLedger.deposit);
    app.use("/test/ledger/withdraw", mockLedger.withdraw);
    app.use("/test/ledger/card-capture", mockLedger.cardCapture);
    app.use("/test/ledger/reconciliation", mockLedger.reconciliation);
    
    // Use mock auth routes under /test/auth/*
    app.use("/test/auth/", mockAuth.login);
    app.use("/test/auth/", mockAuth.register);
    app.use("/test/auth/", mockAuth.listUsers);

    // Mock BaaS debug routes
    app.use("/test/baas/holds", mockBaas.holds);
  }


  return app;
}
