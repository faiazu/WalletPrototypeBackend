import type { Request, Response } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { ledgerService } from "../../services/ledger/ledgerService.js";
import { LedgerReconciliationService } from "../../services/ledger/ledgerReconciliation.js";
import { isMember } from "../../services/wallet/memberService.js";
import {
  adjustmentSchema,
  amountSchema,
  cardCaptureSchema,
  walletParamSchema,
} from "./validator.js";

export const postDeposit = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.walletId!;

      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ error: "Not a wallet member" });
      }

      const { amount, metadata } = amountSchema.parse(req.body);
      const transactionId = `deposit_${walletId}_${userId}_${Date.now()}`;

      await ledgerService.postDeposit({
        transactionId,
        walletId,
        userId,
        amount,
        metadata,
      });

      // Get formatted balances for iOS client
      const balances = await ledgerService.getWalletDisplayBalances(walletId);
      const reconciliation = await LedgerReconciliationService.reconcile(walletId);

      // Helper: Convert cents to dollars
      const centsToDollars = (cents: number): number => cents / 100;

      const ledgerState = {
        walletId,
        poolAccount: {
          id: reconciliation.poolAccount.id,
          balance: centsToDollars(-reconciliation.poolAccount.balance)  // Negate liability to make it positive
        },
        memberEquity: balances.memberEquity.map(m => ({
          userId: m.userId,
          balance: centsToDollars(m.balance)
        })),
        consistent: reconciliation.consistent,
        sumOfMemberEquity: centsToDollars(reconciliation.sumOfMemberEquity)
      };

      const response = { transactionId, ledger: ledgerState };
      
      // Debug logging
      console.log('[DEPOSIT] Response being sent to iOS:');
      console.log(JSON.stringify(response, null, 2));
      console.log('[DEPOSIT] Response types:', {
        transactionId: typeof response.transactionId,
        ledgerState: typeof response.ledger,
        poolBalance: typeof response.ledger.poolAccount.balance,
        sumOfMemberEquity: typeof response.ledger.sumOfMemberEquity,
        memberEquityCount: response.ledger.memberEquity.length
      });

      return res.status(201).json(response);
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid body", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Deposit failed" });
    }
  },
];

export const postWithdraw = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.walletId!;

      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ error: "Not a wallet member" });
      }

      const { amount, metadata } = amountSchema.parse(req.body);
      const transactionId = `withdraw_${walletId}_${userId}_${Date.now()}`;

      const result = await ledgerService.postWithdrawal({
        transactionId,
        walletId,
        userId,
        amount,
        metadata,
      });

      return res.status(201).json({ transactionId, ledger: result });
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid body", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Withdraw failed" });
    }
  },
];

export const postCardCapture = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.walletId!;

      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ error: "Not a wallet member" });
      }

      const { splits, metadata } = cardCaptureSchema.parse(req.body);
      const transactionId = `card_capture_${walletId}_${Date.now()}`;

      const result = await ledgerService.postCardCapture({
        transactionId,
        walletId,
        splits,
        metadata,
      });

      return res.status(201).json({ transactionId, ledger: result });
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid body", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Card capture failed" });
    }
  },
];

export const postAdjustment = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const walletId = req.params.walletId!;

      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ error: "Not a wallet member" });
      }

      const { fromAccountId, toAccountId, amount, metadata } = adjustmentSchema.parse(req.body);
      const transactionId = `adjustment_${walletId}_${Date.now()}`;

      const result = await ledgerService.postAdjustment({
        transactionId,
        fromAccountId,
        toAccountId,
        amount,
        metadata,
      });

      return res.status(201).json({ transactionId, ledger: result });
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid body", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Adjustment failed" });
    }
  },
];

export const getReconciliation = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { walletId } = walletParamSchema.parse(req.params);

      if (!(await isMember(walletId, userId))) {
        return res.status(403).json({ error: "Not a wallet member" });
      }

      const reconciliation = await LedgerReconciliationService.reconcile(walletId);
      const balances = await ledgerService.getWalletDisplayBalances(walletId);

      // Helper: Convert cents to dollars
      const centsToDollars = (cents: number): number => cents / 100;

      // Format response for iOS client (convert cents to dollars)
      const response = {
        walletId: reconciliation.walletId,
        poolAccount: {
          id: reconciliation.poolAccount.id,
          balance: centsToDollars(-reconciliation.poolAccount.balance)  // Convert to positive and to dollars
        },
        memberEquity: balances.memberEquity.map(m => ({
          userId: m.userId,
          balance: centsToDollars(m.balance)
        })),
        sumOfMemberEquity: centsToDollars(reconciliation.sumOfMemberEquity),
        consistent: reconciliation.consistent,
        timestamp: new Date().toISOString()
      };

      return res.json(response);
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid walletId" });
      }
      return res.status(400).json({ error: err.message || "Reconciliation failed" });
    }
  },
];
