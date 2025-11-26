import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

// Routes
import { authRouter } from "./routes/authRoutes.js";
import { userRouter } from "./routes/userRoutes.js";
import { walletRouter } from "./routes/walletRoutes.js";

// Mock ledger routes for testing
import { mockLedger } from "./tests/mocks/ledger/mockLedgerIndex.js";

dotenv.config();

export function createApp(): Application {
  const app = express();

  app.use(cors());
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


  // Mock ledger routes for testing
  if (process.env.NODE_ENV !== "production") {
    app.use("/test/ledger/deposit", mockLedger.deposit);
    app.use("/test/ledger/withdraw", mockLedger.withdraw);
    app.use("/test/ledger/card-capture", mockLedger.cardCapture);
  }


  return app;
}
