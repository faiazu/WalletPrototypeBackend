import type { Request, Response } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";
import { addMember, isMember } from "../../services/wallet/memberService.js";
import { requireUserByEmail } from "../../services/user/userService.js";
import { walletService } from "../../services/wallet/walletService.js";
import { createWalletSchema, inviteSchema, createFundingRouteSchema, updateSpendPolicySchema } from "./validator.js";
import { fundingRouteService } from "../../services/baas/fundingRouteService.js";
import { ledgerService } from "../../services/ledger/ledgerService.js";
import { splittingPolicyService } from "../../services/wallet/splittingPolicyService.js";

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
      if ((user.kycStatus ?? "UNKNOWN") !== "ACCEPTED") {
        return res
          .status(403)
          .json({ error: "KycRequired", message: "KYC approval is required before creating a wallet." });
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

      // Fetch wallet details and balances to return enriched context
      const wallet = await walletService.getWalletDetails(walletId);
      const balances = await ledgerService.getWalletDisplayBalances(walletId);

      return res.status(201).json({ wallet, balances, member });
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

      // Fetch wallet details and balances to return enriched context
      const wallet = await walletService.getWalletDetails(walletId);
      const balances = await ledgerService.getWalletDisplayBalances(walletId);

      return res.status(201).json({ wallet, balances, member });
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

      const balances = await ledgerService.getWalletDisplayBalances(walletId);

      return res.json({ wallet, balances });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to fetch wallet" });
    }
  },
];

/**
 * Create a funding route for a wallet.
 * Admin only.
 */
export const createFundingRoute = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      // Verify wallet exists and user is admin
      const wallet = await walletService.getWalletById(walletId);
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      const isAdmin = await walletService.isWalletAdmin(walletId, userId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Only wallet admin can manage funding routes" });
      }

      const { providerName, providerAccountId, reference, userId: routeUserId, baasAccountId } =
        createFundingRouteSchema.parse(req.body);

      // Verify the target user is a member of the wallet
      const targetUserMember = await isMember(walletId, routeUserId);
      if (!targetUserMember) {
        return res.status(400).json({ error: "Target user must be a wallet member" });
      }

      const route = await fundingRouteService.upsertRoute({
        providerName,
        providerAccountId,
        reference,
        walletId,
        userId: routeUserId,
        baasAccountId,
      });

      return res.status(201).json({ route });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request body", details: err.errors });
      }

      return res.status(400).json({ error: err.message || "Failed to create funding route" });
    }
  },
];

/**
 * List funding routes for a wallet.
 * Admin or member can view.
 */
export const listFundingRoutes = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      // Verify wallet exists and user has access
      const wallet = await walletService.getWalletById(walletId);
      if (!wallet) return res.status(404).json({ error: "Wallet not found" });

      const isAdmin = await walletService.isWalletAdmin(walletId, userId);
      const member = await isMember(walletId, userId);
      if (!isAdmin && !member) {
        return res.status(403).json({ error: "Access denied" });
      }

      const routes = await fundingRouteService.listByWallet(walletId);

      return res.json({ routes });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to list funding routes" });
    }
  },
];

/**
 * Update wallet spend policy (admin only).
 */
export const updateSpendPolicy = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      // Only wallet admin can update spend policy
      if (!(await walletService.isWalletAdmin(walletId, userId))) {
        return res.status(403).json({ 
          error: "AccessDenied", 
          message: "Only wallet admin can update spend policy." 
        });
      }

      const { spendPolicy } = updateSpendPolicySchema.parse(req.body);

      // Update wallet spend policy
      const updatedWallet = await prisma.wallet.update({
        where: { id: walletId },
        data: { spendPolicy },
      });

      // Invalidate cache so next card clearing uses new policy
      splittingPolicyService.invalidateCache(walletId);

      return res.json({ 
        wallet: updatedWallet,
        message: "Spend policy updated successfully"
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request body", details: err.errors });
      }
      return res.status(400).json({ error: err.message || "Failed to update spend policy" });
    }
  },
];
