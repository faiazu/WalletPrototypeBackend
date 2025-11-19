import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./core/db.js";
import { authRouter } from "./features/auth/authRoutes.js";

dotenv.config();

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.get("/debug/users-count", async (req: Request, res: Response) => {
    const count = await prisma.user.count();
    res.json({ count });
  });

  app.use("/auth", authRouter);

  return app;
}
