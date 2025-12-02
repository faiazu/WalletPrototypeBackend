import type { Request, Response } from "express";
import { z } from "zod";

import { authMiddleware } from "../../core/authMiddleware.js";
import { withdrawalService } from "../../services/wallet/withdrawalService.js";
import { ledgerService } from "../../services/ledger/ledgerService.js";
import { baasService } from "../../core/dependencies.js";
import { isMember } from "../../services/wallet/memberService.js";

/**
 * Request body schema for withdrawal creation
 */
const createWithdrawalSchema = z.object({
  amountMinor: z.number().int().positive("Amount must be positive"),
  currency: z.string().default("USD"),
  metadata: z.any().optional(),
});

/**
 * POST /wallet/:id/withdrawals
 * 
 * Create a new withdrawal request for the authenticated user
 * 
 * Flow:
 * 1. Validate user membership and equity
 * 2. Create withdrawal request (PENDING)
 * 3. Move funds to pending liability account
 * 4. Initiate provider payout
 * 5. Create withdrawal transfer record
 * 6. Return request details
 */
export const createWithdrawal = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      // Validate request body
      const { amountMinor, currency, metadata } = createWithdrawalSchema.parse(req.body);

      // Validate user is wallet member
      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ 
          error: "AccessDenied", 
          message: "You are not a member of this wallet" 
        });
      }

      // Execute withdrawal flow in transaction
      const result = await withdrawalService.executeWithdrawal({
        walletId,
        userId,
        amountMinor,
        currency,
        metadata,
        baasService,
        ledgerService,
      });

      return res.status(201).json({
        withdrawalRequest: result.request,
        withdrawalTransfer: result.transfer,
        message: "Withdrawal initiated successfully",
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ 
          error: "InvalidRequest", 
          details: err.errors 
        });
      }

      // Handle specific errors
      const errorMap: Record<string, { status: number; message: string }> = {
        UserNotMember: { status: 403, message: "You are not a member of this wallet" },
        InsufficientEquity: { status: 400, message: "Insufficient equity balance" },
        InvalidAmount: { status: 400, message: "Amount must be positive" },
        ProviderDoesNotSupportPayouts: { status: 503, message: "Payout service unavailable" },
      };

      const errorInfo = errorMap[err.message] || { 
        status: 500, 
        message: err.message || "Withdrawal failed" 
      };

      return res.status(errorInfo.status).json({ 
        error: err.message, 
        message: errorInfo.message 
      });
    }
  },
];

/**
 * GET /wallet/:id/withdrawals
 * 
 * List withdrawal history for a wallet
 * Only members can view
 */
export const listWithdrawals = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;

      // Validate user is wallet member
      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ 
          error: "AccessDenied", 
          message: "You are not a member of this wallet" 
        });
      }

      // Parse query parameters
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;

      // Get withdrawals for wallet
      const withdrawals = await withdrawalService.getWithdrawalsByWallet(walletId, {
        limit,
        offset,
        status: status as any,
      });

      return res.json({ 
        withdrawals,
        count: withdrawals.length,
        limit,
        offset,
      });
    } catch (err: any) {
      return res.status(500).json({ 
        error: "ListFailed", 
        message: err.message || "Failed to list withdrawals" 
      });
    }
  },
];

/**
 * GET /wallet/:id/withdrawals/:withdrawalId
 * 
 * Get details of a specific withdrawal
 */
export const getWithdrawal = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.id!;
      const withdrawalId = req.params.withdrawalId!;

      // Validate user is wallet member
      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ 
          error: "AccessDenied", 
          message: "You are not a member of this wallet" 
        });
      }

      // Get withdrawal
      const withdrawal = await withdrawalService.getWithdrawalRequest(withdrawalId);

      if (!withdrawal) {
        return res.status(404).json({ 
          error: "NotFound", 
          message: "Withdrawal not found" 
        });
      }

      // Verify withdrawal belongs to this wallet
      if (withdrawal.walletId !== walletId) {
        return res.status(403).json({ 
          error: "AccessDenied", 
          message: "Withdrawal does not belong to this wallet" 
        });
      }

      return res.json({ withdrawal });
    } catch (err: any) {
      return res.status(500).json({ 
        error: "GetFailed", 
        message: err.message || "Failed to get withdrawal" 
      });
    }
  },
];

