import express, { type Application, type Request, type Response } from "express";
import cors from "cors";

import "./core/config.js";
import { registerApiRoutes, registerWebhookRoutes } from "./routers.js";
import { requestLoggerMiddleware } from "./core/logger.js";
import { register as metricsRegister } from "./core/metrics.js";

// Mock ledger routes for testing
import { mockLedger } from "./tests/mocks/ledger/mockLedgerIndex.js";
import { mockAuth } from "./tests/mocks/auth/mockAuthIndex.js";
import { mockBaas } from "./tests/mocks/baas/mockBaasIndex.js";

export function createApp(): Application {
  const app = express();

  app.use(cors());
  
  // Attach request logger middleware for request tracking
  app.use(requestLoggerMiddleware);

  // Webhooks need raw body (before express.json) to allow signature verification
  registerWebhookRoutes(app);

  // JSON body parser for API routes
  registerApiRoutes(app);

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Prometheus metrics endpoint (non-production or with API key)
  app.get("/metrics", async (req: Request, res: Response) => {
    // Simple auth: require METRICS_API_KEY in production
    if (process.env.NODE_ENV === "production") {
      const apiKey = req.headers["x-metrics-api-key"];
      if (!apiKey || apiKey !== process.env.METRICS_API_KEY) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    try {
      res.set("Content-Type", metricsRegister.contentType);
      const metrics = await metricsRegister.metrics();
      res.send(metrics);
    } catch (err) {
      res.status(500).json({ error: "Failed to collect metrics" });
    }
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
    app.use("/test/baas/funding", mockBaas.funding);
    app.use("/test/baas/payout-status", mockBaas.payoutStatus);
    app.use("/test/baas/reset", mockBaas.reset);
    app.use("/test/state", mockBaas.state);
  }


  return app;
}
