import express, { type Application, type Request, type Response } from "express";
import cors from "cors";

import "./core/config.js";
import { registerApiRoutes, registerWebhookRoutes } from "./routers.js";

// Mock ledger routes for testing
import { mockLedger } from "./tests/mocks/ledger/mockLedgerIndex.js";
import { mockAuth } from "./tests/mocks/auth/mockAuthIndex.js";
import { mockBaas } from "./tests/mocks/baas/mockBaasIndex.js";

export function createApp(): Application {
  const app = express();

  app.use(cors());

  // Webhooks need raw body (before express.json) to allow signature verification
  registerWebhookRoutes(app);

  // JSON body parser for API routes
  registerApiRoutes(app);

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

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
