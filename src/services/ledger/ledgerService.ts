import { prisma } from "../../core/db.js";
import type { LedgerAccount } from "../../generated/prisma/client.js";
import { postingEngine } from "./postingEngine.js";

export const ledgerService = {

  //
  // Get ledger accounts for convenience
  //
  async getAccountById(accountId: string): Promise<LedgerAccount> {
    const account = await prisma.ledgerAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) throw new Error("LedgerAccountNotFound");
    return account;
  },

  async getMemberEquityAccount(walletId: string, userId: string): Promise<LedgerAccount> {
    const account = await prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        userId,
        type: "member_equity"
      }
    });
    if (!account) throw new Error("MemberEquityAccountNotFound");
    return account;
  },

  async getWalletPoolAccount(walletId: string): Promise<LedgerAccount> {
    const account = await prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        userId: null,
        type: "wallet_pool"
      }
    });
    if (!account) throw new Error("WalletPoolAccountNotFound");
    return account;
  },

  async getWalletLedgerAccounts(walletId: string): Promise<LedgerAccount[]> {
    return prisma.ledgerAccount.findMany({
      where: { walletId: walletId }
    });
  },

  /**
   * Human-friendly balances (credit-normal storage -> display as positive pool).
   *
   * Pool is stored as a liability (credits increase), so we negate it for display.
   * Member equity is already positive in storage, so we keep it as-is.
   */
  async getWalletDisplayBalances(walletId: string): Promise<{
    poolDisplay: number;
    memberEquity: Array<{ userId: string; balance: number }>;
  }> {
    const pool = await this.getWalletPoolAccount(walletId);
    const equityAccounts = await prisma.ledgerAccount.findMany({
      where: { walletId, type: "member_equity" },
      orderBy: { createdAt: "asc" },
    });

    return {
      poolDisplay: -pool.balance,
      memberEquity: equityAccounts.map((acc) => ({
        userId: acc.userId!,
        balance: acc.balance,
      })),
    };
  },

  // get wallet_pool balance
  async getWalletPoolBalance(walletId: string): Promise<number> {
    const pool: LedgerAccount = await this.getWalletPoolAccount(walletId);
    return pool.balance;
  },

  //
  // POST DEPOSIT
  // Debit: wallet_pool
  // Credit: member_equity[user]
  //
  async postDeposit({
    transactionId,
    walletId,
    userId,
    amount,
    metadata
  }: {
    transactionId: string,
    walletId: string,
    userId: string,
    amount: number,
    metadata?: any
  }) {

    const pool = await this.getWalletPoolAccount(walletId);
    const member = await this.getMemberEquityAccount(walletId, userId);

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: pool.id,
          creditAccountId: member.id,
          amount,
          metadata: {
            type: "deposit",
            ...metadata
          }
        }
      ]
    });
  },

  //
  // POST WITHDRAWAL
  // Debit: member_equity[user]
  // Credit: wallet_pool
  //
  async postWithdrawal({
    transactionId,
    walletId,
    userId,
    amount,
    metadata
  }: {
    transactionId: string,
    walletId: string,
    userId: string,
    amount: number,
    metadata?: any
  }) {

    const pool = await this.getWalletPoolAccount(walletId);
    const member = await this.getMemberEquityAccount(walletId, userId);

    // BASIC RULE: user cannot withdraw more than their equity
    if (member.balance < amount) {
      throw new Error("InsufficientEquity");
    }

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: member.id,
          creditAccountId: pool.id,
          amount,
          metadata: {
            type: "withdrawal",
            ...metadata
          }
        }
      ]
    });
  },

  //
  // NEW: CARD PURCHASE CAPTURE
  //
  // For each split:
  //   Debit: member_equity[user]
  //   Credit: wallet_pool
  //
  // Splitting logic (who pays what) happens BEFORE calling this.
  //

  async postCardCapture({
    transactionId,
    walletId,
    splits,
    metadata,
  }: {
    transactionId: string;
    walletId: string;
    splits: Array<{ userId: string; amount: number }>;
    metadata?: any;
  }) {
    const pool = await this.getWalletPoolAccount(walletId);

    const entries: Array<{
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
      metadata?: any;
    }> = [];

    for (const split of splits) {
      const equity = await this.getMemberEquityAccount(walletId, split.userId);

      entries.push({
        debitAccountId: equity.id,
        creditAccountId: pool.id,
        amount: split.amount,
        metadata: {
          type: "card_capture",
          walletId,
          userId: split.userId,
          ...metadata,
        },
      });
    }

    return postingEngine.post({
      transactionId,
      entries,
    });
  },

  //
  // INTERNAL ADJUSTMENT
  // Generic movement between ANY two ledger accounts.
  // Debit A, Credit B.
  //
  async postAdjustment({
    transactionId,
    fromAccountId,
    toAccountId,
    amount,
    metadata
  }: {
    transactionId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    metadata?: any
  }) {

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: fromAccountId,
          creditAccountId: toAccountId,
          amount,
          metadata: {
            type: "adjustment",
            ...metadata
          }
        }
      ]
    });
  },

  //
  // INTERNAL TRANSFER (member <-> member)
  // Debit: memberA
  // Credit: memberB
  //
  async postMemberToMemberTransfer({
    transactionId,
    walletId,
    fromUserId,
    toUserId,
    amount,
    metadata
  }: {
    transactionId: string,
    walletId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    metadata?: any
  }) {

    const fromAcc = await this.getMemberEquityAccount(walletId, fromUserId);
    const toAcc = await this.getMemberEquityAccount(walletId, toUserId);

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: fromAcc.id,
          creditAccountId: toAcc.id,
          amount,
          metadata: {
            type: "member_transfer",
            fromUserId,
            toUserId,
            ...metadata
          }
        }
      ]
    });
  }
};
