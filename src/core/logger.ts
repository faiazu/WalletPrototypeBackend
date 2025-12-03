import pino from "pino";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";

// Create logger instance with environment-based configuration
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: pino.Logger;
    }
  }
}

/**
 * Express middleware to attach requestId and logger to each request
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: () => void
) {
  const requestId = req.headers["x-request-id"] as string || randomUUID();
  req.requestId = requestId;
  req.log = logger.child({ requestId });

  // Log incoming request
  req.log.info(
    {
      method: req.method,
      url: req.url,
      ip: req.ip,
    },
    "Incoming request"
  );

  // Log response on finish
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    req.log![req.log!.level === "debug" ? "debug" : "info"](
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
      },
      "Request completed"
    );
  });

  next();
}

// Export log level helpers
export const logLevels = {
  trace: logger.trace.bind(logger),
  debug: logger.debug.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  fatal: logger.fatal.bind(logger),
};

