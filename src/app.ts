import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./core/db.js";

import { authRouter } from "./routes/authRoutes.js";
import { userRouter } from "./routes/userRoutes.js";
import { walletRouter } from "./routes/walletRoutes.js";

dotenv.config();

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

//   app.get("/debug/users-count", async (req: Request, res: Response) => {
//     const count = await prisma.user.count();
//     res.json({ count });
//   });

  // Auth routes (ex POST /auth/google)
  app.use("/auth", authRouter);

  // User routes (ex GET /user/me)
  app.use("/user", userRouter);

  // Wallet routes (create/invite/join/get)
  app.use("/wallet", walletRouter);

  if (process.env.NODE_ENV !== "production") {
    // app.use("/test/ledger", mockLedgerRoutes);
  }


  return app;
}
