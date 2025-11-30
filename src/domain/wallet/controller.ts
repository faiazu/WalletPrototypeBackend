import type { Request, Response } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";
import { addMember, isMember } from "../../services/wallet/memberService.js";
import { requireUserByEmail } from "../../services/user/userService.js";
import { walletService } from "../../services/wallet/walletService.js";
import { createWalletSchema, inviteSchema } from "./validator.js";
import { ledgerService } from "../../services/ledger/ledgerService.js";
import { baasService } from "../../core/dependencies.js";

/**
 * Controller for creating a wallet.
 */
export const createWallet = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: "UserNotFound", message: "User record missing; please re-login." });
      }
      const { name } = createWalletSchema.parse(req.body);

      const result = await walletService.createWallet({
        name: name,
        adminUserId: userId,
      });

      return res.status(201).json(result);
    } catch (err: any) {
      if (err.name === "ZodError")
        return res.status(400).json({ error: "Invalid request body", details: err.errors });

      return res.status(400).json({ error: err.message || "Failed to create wallet" });
    }
  },
];

/**
 * List wallets the current user belongs to.
 */
export const listMyWallets = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const memberships = await prisma.walletMember.findMany({
        where: { userId },
        include: { wallet: true },
        orderBy: { joinedAt: "asc" },
      });
      const wallets = memberships.map((m) => m.wallet);
      return res.json({ wallets });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to list wallets" });
    }
  },
];

/**
 * Controller for inviting a member to a wallet.
 */
export const inviteMember = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId: string = req.userId!;
      const walletId: string = req.params.id!;

      const { email, role } = inviteSchema.parse(req.body);

      const wallet = await walletService.getWalletById(walletId);
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      // permission check
      if (wallet.adminId !== userId)
        return res.status(403).json({ error: "Only admin can invite members" });

      const invitee = await requireUserByEmail(email);

      if (await isMember(walletId, invitee.id))
        return res.status(400).json({ error: "User already a member" });

      const member = await addMember(walletId, invitee.id, role || "member");

      return res.status(201).json({ member });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request body", details: err.errors });
      }

      return res.status(400).json({ error: err.message || "Failed to invite member" });
    }
  },
];

/**
 * Controller for joining a wallet.
 */
export const joinWallet = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      const wallet = await walletService.getWalletById(walletId);
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      if (await isMember(walletId, userId))
        return res.status(400).json({ error: "Already a member" });

      const member = await addMember(walletId, userId, "member");

      return res.status(201).json({ member });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to join wallet" });
    }
  },
];

/**
 * Controller for fetching wallet details.
 */
export const getWalletDetails = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      const wallet = await walletService.getWalletDetails(walletId);
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      const admin = await walletService.isWalletAdmin(walletId, userId);
      const member = await isMember(walletId, userId);
      if (!admin && !member) return res.status(403).json({ error: "Access denied" });

      return res.json({ wallet });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to fetch wallet" });
    }
  },
];

/**
 * Bootstrap a default wallet + card for the current user.
 */
export const bootstrapDefaultWallet = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: "UserNotFound", message: "User record missing; please re-login." });
      }
      const defaultName = process.env.DEFAULT_WALLET_NAME || "Groceries";

      // 1) Find existing wallet membership
      let walletMember = await prisma.walletMember.findFirst({
        where: { userId },
        include: { wallet: true },
        orderBy: { joinedAt: "asc" },
      });

      // 2) Create wallet if none
      if (!walletMember) {
        const created = await walletService.createWallet({
          name: defaultName,
          adminUserId: userId,
        });
        walletMember = await prisma.walletMember.findFirst({
          where: { userId, walletId: created.wallet.id },
          include: { wallet: true },
        });
      }

      if (!walletMember || !walletMember.wallet) {
        return res.status(500).json({ error: "Failed to ensure wallet" });
      }

      const walletId = walletMember.wallet.id;

      // 3) Ensure user is member (should be already)
      if (!(await isMember(walletId, userId))) {
        await addMember(walletId, userId, "member");
      }

      // 4) Ensure a card exists for this user + wallet
      let card = await prisma.baasCard.findFirst({
        where: { walletId, userId },
        orderBy: { createdAt: "asc" },
      });

      if (!card) {
        const issued = await baasService.createCardForUser(userId, walletId);
        card = await prisma.baasCard.findFirst({
          where: { walletId, userId, externalCardId: issued.externalCardId },
        });
      }

      // 5) Fetch wallet details + reconciliation for balances
      const wallet = await walletService.getWalletDetails(walletId);
      const reconciliation = await ledgerService.getWalletDisplayBalances(walletId);

      return res.status(200).json({
        wallet,
        card,
        balances: reconciliation,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to bootstrap wallet" });
    }
  },
];
