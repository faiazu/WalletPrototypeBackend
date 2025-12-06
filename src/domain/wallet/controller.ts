import type { Request, Response } from "express";
import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";
import {
  addWalletMember,
  createWallet,
  getWalletDetails,
  isWalletAdmin,
  isWalletMember,
  listWalletsForUser,
} from "./service.js";
import { addMemberSchema, createWalletSchema } from "./validator.js";
import { WalletRole } from "../../generated/prisma/client.js";

export const createWalletHandler = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { name } = createWalletSchema.parse(req.body);
      const wallet = await createWallet(name, userId);
      return res.status(201).json({ wallet });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "InvalidRequest", details: err.errors });
      }
      return res.status(400).json({ error: err?.message ?? "Failed to create wallet" });
    }
  },
];

export const listWalletsHandler = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const wallets = await listWalletsForUser(userId);
      return res.json({ wallets });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message ?? "Failed to list wallets" });
    }
  },
];

export const getWalletHandler = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.walletId!;

      const wallet = await getWalletDetails(walletId);
      if (!wallet) {
        return res.status(404).json({ error: "WalletNotFound" });
      }

      const canView = (await isWalletAdmin(walletId, userId)) || (await isWalletMember(walletId, userId));
      if (!canView) {
        return res.status(403).json({ error: "AccessDenied" });
      }

      return res.json({ wallet });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message ?? "Failed to fetch wallet" });
    }
  },
];

export const addMemberHandler = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.walletId!;
      const { userId: newUserId, role } = addMemberSchema.parse(req.body);

      if (!(await isWalletAdmin(walletId, userId))) {
        return res.status(403).json({ error: "OnlyAdminCanInvite" });
      }

      const alreadyMember = await prisma.walletMember.findUnique({
        where: {
          walletId_userId: {
            walletId,
            userId: newUserId,
          },
        },
      });
      if (alreadyMember) {
        return res.status(400).json({ error: "UserAlreadyMember" });
      }

      const member = await addWalletMember(walletId, newUserId, role as WalletRole);
      return res.status(201).json({ member });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "InvalidRequest", details: err.errors });
      }
      return res.status(400).json({ error: err?.message ?? "Failed to add member" });
    }
  },
];

