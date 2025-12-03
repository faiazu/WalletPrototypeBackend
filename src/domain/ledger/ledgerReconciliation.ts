import { z } from "zod";

import type { LedgerAccount } from "../../generated/prisma/client.js";
import { LedgerScope } from "../../generated/prisma/client.js";

import { prisma } from "../../core/db.js";


// Strongly Typed Result Interface
export interface LedgerReconciliationResult {
  walletId: string;
  poolAccount: LedgerAccount;
  memberEquityAccounts: LedgerAccount[];
  sumOfMemberEquity: number;
  consistent: boolean;
}

// Zod schema for runtime validation
export const LedgerReconciliationSchema = z.object({
  walletId: z.string(),
  poolAccount: z.any(), // because Prisma types cannot be validated directly
  memberEquityAccounts: z.array(z.any()),
  sumOfMemberEquity: z.number(),
  consistent: z.boolean(),
});

export class LedgerReconciliationService {

  /*
    * Reconcile ledger accounts for a given wallet.
    *
    * Ensures:
    *   sum(member_equity.balance) == wallet_pool.balance
  */
  static async reconcile(walletId: string): Promise<LedgerReconciliationResult> {
    // 1. Fetch pool account
    const poolAccount = await prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        type: "wallet_pool",
        userId: null,
      },
    });

    if (!poolAccount) {
      throw new Error("Wallet pool account not found");
    }

    // 2. Fetch all equity accounts
    const memberEquityAccounts = await prisma.ledgerAccount.findMany({
      where: {
        walletId,
        type: "member_equity",
      },
    });

    // 3. Sum balances (member equity holds positive amounts; pool is currently negative)
    const sumOfMemberEquity = memberEquityAccounts.reduce(
      (sum, acc) => sum + acc.balance,
      0
    );

    // 4. Verify consistency.
    // Sign convention today:
    //  - pool balance is negative (debited on deposits)
    //  - member equity is positive
    // The ledger is consistent when they net to zero.
    const consistent = sumOfMemberEquity + poolAccount.balance === 0;

    // 5. Build result
    const result: LedgerReconciliationResult = {
      walletId,
      poolAccount,
      memberEquityAccounts,
      sumOfMemberEquity,
      consistent,
    };

    // 6. Runtime validation
    LedgerReconciliationSchema.parse(result);

    return result;
  }

  /**
   * Reconcile ledger accounts for a specific card.
   * 
   * Ensures:
   *   sum(card_member_equity.balance) == card_pool.balance
   */
  static async reconcileCard(cardId: string): Promise<CardLedgerReconciliationResult> {
    // 1. Fetch card pool account
    const cardPoolAccount = await prisma.ledgerAccount.findFirst({
      where: {
        cardId,
        ledgerScope: LedgerScope.CARD_POOL,
        userId: null,
      },
    });

    if (!cardPoolAccount) {
      throw new Error("Card pool account not found");
    }

    // 2. Fetch all equity accounts for this card
    const cardMemberEquityAccounts = await prisma.ledgerAccount.findMany({
      where: {
        cardId,
        ledgerScope: LedgerScope.CARD_MEMBER_EQUITY,
      },
    });

    // 3. Fetch pending withdrawal account (if exists)
    const cardPendingAccount = await prisma.ledgerAccount.findFirst({
      where: {
        cardId,
        ledgerScope: LedgerScope.CARD_PENDING_WITHDRAWAL,
        userId: null,
      },
    });

    // 4. Sum balances
    const sumOfMemberEquity = cardMemberEquityAccounts.reduce(
      (sum, acc) => sum + acc.balance,
      0
    );

    const pendingWithdrawalBalance = cardPendingAccount?.balance || 0;

    // 5. Verify consistency
    // Pool is negative (liability), equity + pending are positive (assets)
    // They should net to zero: equity + pending + pool === 0
    const consistent = sumOfMemberEquity + pendingWithdrawalBalance + cardPoolAccount.balance === 0;

    // 6. Build result
    const result: CardLedgerReconciliationResult = {
      cardId,
      cardPoolAccount,
      cardMemberEquityAccounts,
      cardPendingAccount: cardPendingAccount || null,
      sumOfMemberEquity,
      pendingWithdrawalBalance,
      consistent,
    };

    return result;
  }
}

// Card Reconciliation Result Interface
export interface CardLedgerReconciliationResult {
  cardId: string;
  cardPoolAccount: LedgerAccount;
  cardMemberEquityAccounts: LedgerAccount[];
  cardPendingAccount: LedgerAccount | null;
  sumOfMemberEquity: number;
  pendingWithdrawalBalance: number;
  consistent: boolean;
}

