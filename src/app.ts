import express, { type Application, type Request, type Response } from "express";
import cors from "cors";

import "./core/config.js";
import { registerApiRoutes } from "./routers.js";
import { requestLoggerMiddleware } from "./core/logger.js";
import { register as metricsRegister } from "./core/metrics.js";

export function createApp(): Application {
  const app = express();

  app.use(cors());

  // Attach request logger middleware for request tracking
  app.use(requestLoggerMiddleware);

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

  return app;
}
