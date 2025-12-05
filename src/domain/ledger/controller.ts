import type { Request, Response } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { ledgerService } from "./service.js";
import { LedgerReconciliationService } from "./ledgerReconciliation.js";
import { isMember } from "../wallet/memberService.js";
import { prisma } from "../../core/db.js";
import {
  adjustmentSchema,
  amountSchema,
  cardCaptureSchema,
  walletParamSchema,
  cardParamSchema,
} from "./validator.js";

/**
 * Helper: Validate card membership through the card's wallet
 */
async function isCardMember(cardId: string, userId: string): Promise<boolean> {
  console.error(`🔍 [isCardMember] Checking if userId="${userId}" is member of card="${cardId}"`);
  
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { walletId: true },
  });
  
  if (!card) {
    console.error(`❌ [isCardMember] Card not found: ${cardId}`);
    return false;
  }
  
  if (!card.walletId) {
    console.error(`❌ [isCardMember] Card has no walletId: ${cardId}`);
    return false;
  }
  
  console.error(`🔍 [isCardMember] Card walletId="${card.walletId}", checking membership...`);
  const result = await isMember(card.walletId, userId);
  console.error(`${result ? '✅' : '❌'} [isCardMember] User ${result ? 'IS' : 'IS NOT'} a member`);
  
  return result;
}

/**
 * Helper: Convert cents to dollars for iOS client
 */
const centsToDollars = (cents: number): number => cents / 100;

// ============================================
// CARD-CENTRIC ENDPOINTS (NEW)
// ============================================

/**
 * POST /cards/:cardId/deposit
 * Card-scoped deposit endpoint
 */
export const postCardDeposit = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      console.error(`📥 [postCardDeposit] Request from userId="${userId}"`); // Using console.error
      
      const { cardId } = cardParamSchema.parse(req.params);
      console.error(`📥 [postCardDeposit] CardId="${cardId}"`);

      // Validate card membership through wallet
      if (!(await isCardMember(cardId, userId))) {
        console.error(`❌ [postCardDeposit] Authorization failed for userId="${userId}", cardId="${cardId}"`);
        return res.status(403).json({ error: "Not a card member" });
      }
      
      console.error(`✅ [postCardDeposit] Authorization passed for userId="${userId}", cardId="${cardId}"`);

      const { amount, metadata } = amountSchema.parse(req.body);
      const transactionId = `card_deposit_${cardId}_${userId}_${Date.now()}`;

      await ledgerService.postCardDeposit({
        transactionId,
        cardId,
        userId,
        amount,
        metadata,
      });

      // Get card-specific balances
      const cardBalances = await ledgerService.getCardDisplayBalances(cardId);
      const reconciliation = await ledgerService.getCardReconciliation(cardId);

      const ledgerState = {
        cardId,
        poolBalance: centsToDollars(cardBalances.poolDisplay),
        memberEquity: cardBalances.memberEquity.map(m => ({
          userId: m.userId,
          balance: centsToDollars(m.balance)
        })),
        pendingWithdrawals: centsToDollars(cardBalances.pendingWithdrawals),
        consistent: reconciliation.consistent,
        sumOfMemberEquity: centsToDollars(reconciliation.sumOfMemberEquity)
      };

      return res.status(201).json({ transactionId, ledger: ledgerState });
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid input", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Deposit failed" });
    }
  },
];

/**
 * POST /cards/:cardId/withdraw
 * Card-scoped withdrawal endpoint (immediate, for legacy support)
 */
export const postCardWithdraw = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { cardId } = cardParamSchema.parse(req.params);

      if (!(await isCardMember(cardId, userId))) {
        return res.status(403).json({ error: "Not a card member" });
      }

      const { amount, metadata } = amountSchema.parse(req.body);
      const transactionId = `card_withdraw_${cardId}_${userId}_${Date.now()}`;

      await ledgerService.postCardWithdrawal({
        transactionId,
        cardId,
        userId,
        amount,
        metadata,
      });

      const cardBalances = await ledgerService.getCardDisplayBalances(cardId);
      const reconciliation = await ledgerService.getCardReconciliation(cardId);

      const ledgerState = {
        cardId,
        poolBalance: centsToDollars(cardBalances.poolDisplay),
        memberEquity: cardBalances.memberEquity.map(m => ({
          userId: m.userId,
          balance: centsToDollars(m.balance)
        })),
        pendingWithdrawals: centsToDollars(cardBalances.pendingWithdrawals),
        consistent: reconciliation.consistent,
        sumOfMemberEquity: centsToDollars(reconciliation.sumOfMemberEquity)
      };

      return res.status(201).json({ transactionId, ledger: ledgerState });
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid input", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Withdraw failed" });
    }
  },
];

/**
 * POST /cards/:cardId/capture
 * Card-scoped capture endpoint (for purchases with splits)
 */
export const postCardCaptureNew = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { cardId } = cardParamSchema.parse(req.params);

      if (!(await isCardMember(cardId, userId))) {
        return res.status(403).json({ error: "Not a card member" });
      }

      const { splits, metadata } = cardCaptureSchema.parse(req.body);
      const transactionId = `card_capture_${cardId}_${Date.now()}`;

      await ledgerService.postCardCaptureNew({
        transactionId,
        cardId,
        splits,
        metadata,
      });

      const cardBalances = await ledgerService.getCardDisplayBalances(cardId);
      const reconciliation = await ledgerService.getCardReconciliation(cardId);

      const ledgerState = {
        cardId,
        poolBalance: centsToDollars(cardBalances.poolDisplay),
        memberEquity: cardBalances.memberEquity.map(m => ({
          userId: m.userId,
          balance: centsToDollars(m.balance)
        })),
        pendingWithdrawals: centsToDollars(cardBalances.pendingWithdrawals),
        consistent: reconciliation.consistent,
        sumOfMemberEquity: centsToDollars(reconciliation.sumOfMemberEquity)
      };

      return res.status(201).json({ transactionId, ledger: ledgerState });
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid input", details: (err as any).issues });
      }
      return res.status(400).json({ error: err.message || "Card capture failed" });
    }
  },
];

/**
 * GET /cards/:cardId/reconciliation
 * Card-scoped reconciliation endpoint
 */
export const getCardReconciliation = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { cardId } = cardParamSchema.parse(req.params);

      if (!(await isCardMember(cardId, userId))) {
        return res.status(403).json({ error: "Not a card member" });
      }

      const reconciliation = await ledgerService.getCardReconciliation(cardId);

      const response = {
        cardId: reconciliation.cardId,
        poolBalance: centsToDollars(reconciliation.poolBalance),
        memberEquity: reconciliation.memberEquity.map(m => ({
          userId: m.userId,
          balance: centsToDollars(m.balance)
        })),
        pendingWithdrawals: centsToDollars(reconciliation.pendingWithdrawals),
        sumOfMemberEquity: centsToDollars(reconciliation.sumOfMemberEquity),
        consistent: reconciliation.consistent,
        timestamp: reconciliation.timestamp.toISOString()
      };

      return res.json(response);
    } catch (err: any) {
      if (err instanceof Error && "issues" in err) {
        return res.status(400).json({ error: "Invalid cardId" });
      }
      return res.status(400).json({ error: err.message || "Reconciliation failed" });
    }
  },
];

// ============================================
// LEGACY WALLET-CENTRIC ENDPOINTS (DEPRECATED)
// ============================================

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
