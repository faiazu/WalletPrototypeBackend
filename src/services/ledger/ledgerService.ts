import { prisma } from "../../core/db.js";
import type { LedgerAccount } from "../../generated/prisma/client.js";
import { LedgerScope } from "../../generated/prisma/client.js";
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

  async getPendingWithdrawalAccount(walletId: string): Promise<LedgerAccount> {
    // Find or create pending withdrawal liability account
    let account = await prisma.ledgerAccount.findFirst({
      where: {
        walletId,
        userId: null,
        type: "pending_withdrawal"
      }
    });

    if (!account) {
      // Create it on first use
      account = await prisma.ledgerAccount.create({
        data: {
          walletId,
          userId: null,
          type: "pending_withdrawal",
          balance: 0,
        }
      });
    }

    return account;
  },

  async getWalletLedgerAccounts(walletId: string): Promise<LedgerAccount[]> {
    return prisma.ledgerAccount.findMany({
      where: { walletId: walletId }
    });
  },

  //
  // ========================================
  // CARD-SCOPED LEDGER METHODS (NEW)
  // ========================================
  //

  /**
   * Get the shared pool account for a specific card
   */
  async getCardPoolAccount(cardId: string): Promise<LedgerAccount> {
    const account = await prisma.ledgerAccount.findFirst({
      where: {
        cardId,
        ledgerScope: LedgerScope.CARD_POOL,
        userId: null,
      }
    });
    if (!account) throw new Error("CardPoolAccountNotFound");
    return account;
  },

  /**
   * Get a member's equity account for a specific card
   */
  async getCardMemberEquityAccount(cardId: string, userId: string): Promise<LedgerAccount> {
    const account = await prisma.ledgerAccount.findFirst({
      where: {
        cardId,
        ledgerScope: LedgerScope.CARD_MEMBER_EQUITY,
        userId,
      }
    });
    if (!account) throw new Error("CardMemberEquityAccountNotFound");
    return account;
  },

  /**
   * Get the pending withdrawal account for a specific card
   */
  async getCardPendingWithdrawalAccount(cardId: string): Promise<LedgerAccount> {
    let account = await prisma.ledgerAccount.findFirst({
      where: {
        cardId,
        ledgerScope: LedgerScope.CARD_PENDING_WITHDRAWAL,
        userId: null,
      }
    });

    if (!account) {
      // Create on first use
      const card = await prisma.card.findUnique({
        where: { id: cardId },
        select: { walletId: true }
      });
      if (!card) throw new Error("CardNotFound");

      account = await prisma.ledgerAccount.create({
        data: {
          walletId: card.walletId,
          cardId,
          ledgerScope: LedgerScope.CARD_PENDING_WITHDRAWAL,
          userId: null,
          type: "pending_withdrawal", // Legacy field
          balance: 0,
        }
      });
    }

    return account;
  },

  /**
   * Get all ledger accounts for a specific card
   */
  async getCardLedgerAccounts(cardId: string): Promise<LedgerAccount[]> {
    return prisma.ledgerAccount.findMany({
      where: { cardId }
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
  // POST WITHDRAWAL (Legacy - immediate)
  // Debit: member_equity[user]
  // Credit: wallet_pool
  //
  // NOTE: For real withdrawals with provider payouts, use postPendingWithdrawal
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
  // POST PENDING WITHDRAWAL
  // Move funds to pending account until provider confirms
  // Debit: member_equity[user]
  // Credit: pending_withdrawal
  //
  async postPendingWithdrawal({
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
    const member = await this.getMemberEquityAccount(walletId, userId);
    const pending = await this.getPendingWithdrawalAccount(walletId);

    // Validate equity
    if (member.balance < amount) {
      throw new Error("InsufficientEquity");
    }

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: member.id,
          creditAccountId: pending.id,
          amount,
          metadata: {
            type: "pending_withdrawal",
            ...metadata
          }
        }
      ]
    });
  },

  //
  // FINALIZE WITHDRAWAL
  // Complete a pending withdrawal after provider confirms
  // Debit: pending_withdrawal
  // Credit: wallet_pool
  //
  async finalizeWithdrawal({
    transactionId,
    walletId,
    amount,
    metadata
  }: {
    transactionId: string,
    walletId: string,
    amount: number,
    metadata?: any
  }) {
    const pool = await this.getWalletPoolAccount(walletId);
    const pending = await this.getPendingWithdrawalAccount(walletId);

    // Validate pending has sufficient funds
    if (pending.balance < amount) {
      throw new Error("InsufficientPendingBalance");
    }

    // Finalize withdrawal: money leaves the system
    // Debit: pending_withdrawal (clear the pending account - reduce its positive balance)
    // Credit: wallet_pool (reduce liability - make pool balance less negative)
    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: pending.id,
          creditAccountId: pool.id,
          amount,
          metadata: {
            type: "withdrawal_finalization",
            ...metadata
          }
        }
      ]
    });
  },

  //
  // REVERSE PENDING WITHDRAWAL
  // Return funds to member equity if payout fails
  // Debit: pending_withdrawal
  // Credit: member_equity[user]
  //
  async reversePendingWithdrawal({
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
    const member = await this.getMemberEquityAccount(walletId, userId);
    const pending = await this.getPendingWithdrawalAccount(walletId);

    // Validate pending has sufficient funds
    if (pending.balance < amount) {
      throw new Error("InsufficientPendingBalance");
    }

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: pending.id,
          creditAccountId: member.id,
          amount,
          metadata: {
            type: "withdrawal_reversal",
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

  /**
   * POST CARD DEPOSIT
   * Debit: card_pool
   * Credit: card_member_equity[user]
   */
  async postCardDeposit({
    transactionId,
    cardId,
    userId,
    amount,
    metadata
  }: {
    transactionId: string,
    cardId: string,
    userId: string,
    amount: number,
    metadata?: any
  }) {
    const pool = await this.getCardPoolAccount(cardId);
    const member = await this.getCardMemberEquityAccount(cardId, userId);

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: pool.id,
          creditAccountId: member.id,
          amount,
          metadata: {
            type: "card_deposit",
            cardId,
            ...metadata
          }
        }
      ]
    });
  },

  /**
   * POST CARD WITHDRAWAL (immediate, legacy)
   * Debit: card_member_equity[user]
   * Credit: card_pool
   */
  async postCardWithdrawal({
    transactionId,
    cardId,
    userId,
    amount,
    metadata
  }: {
    transactionId: string,
    cardId: string,
    userId: string,
    amount: number,
    metadata?: any
  }) {
    const pool = await this.getCardPoolAccount(cardId);
    const member = await this.getCardMemberEquityAccount(cardId, userId);

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
            type: "card_withdrawal",
            cardId,
            ...metadata
          }
        }
      ]
    });
  },

  /**
   * POST PENDING CARD WITHDRAWAL
   * Move funds to card-specific pending account
   * Debit: card_member_equity[user]
   * Credit: card_pending_withdrawal
   */
  async postPendingCardWithdrawal({
    transactionId,
    cardId,
    userId,
    amount,
    metadata
  }: {
    transactionId: string,
    cardId: string,
    userId: string,
    amount: number,
    metadata?: any
  }) {
    const member = await this.getCardMemberEquityAccount(cardId, userId);
    const pending = await this.getCardPendingWithdrawalAccount(cardId);

    if (member.balance < amount) {
      throw new Error("InsufficientEquity");
    }

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: member.id,
          creditAccountId: pending.id,
          amount,
          metadata: {
            type: "pending_card_withdrawal",
            cardId,
            ...metadata
          }
        }
      ]
    });
  },

  /**
   * FINALIZE CARD WITHDRAWAL
   * Complete pending withdrawal after provider confirms
   * Debit: card_pending_withdrawal
   * Credit: card_pool
   */
  async finalizeCardWithdrawal({
    transactionId,
    cardId,
    amount,
    metadata
  }: {
    transactionId: string,
    cardId: string,
    amount: number,
    metadata?: any
  }) {
    const pool = await this.getCardPoolAccount(cardId);
    const pending = await this.getCardPendingWithdrawalAccount(cardId);

    if (pending.balance < amount) {
      throw new Error("InsufficientPendingBalance");
    }

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: pending.id,
          creditAccountId: pool.id,
          amount,
          metadata: {
            type: "card_withdrawal_finalization",
            cardId,
            ...metadata
          }
        }
      ]
    });
  },

  /**
   * REVERSE PENDING CARD WITHDRAWAL
   * Return funds to member equity if payout fails
   * Debit: card_pending_withdrawal
   * Credit: card_member_equity[user]
   */
  async reversePendingCardWithdrawal({
    transactionId,
    cardId,
    userId,
    amount,
    metadata
  }: {
    transactionId: string,
    cardId: string,
    userId: string,
    amount: number,
    metadata?: any
  }) {
    const member = await this.getCardMemberEquityAccount(cardId, userId);
    const pending = await this.getCardPendingWithdrawalAccount(cardId);

    if (pending.balance < amount) {
      throw new Error("InsufficientPendingBalance");
    }

    return postingEngine.post({
      transactionId,
      entries: [
        {
          debitAccountId: pending.id,
          creditAccountId: member.id,
          amount,
          metadata: {
            type: "card_withdrawal_reversal",
            cardId,
            ...metadata
          }
        }
      ]
    });
  },

  /**
   * POST CARD CAPTURE (Purchase)
   * For each split:
   *   Debit: card_member_equity[user]
   *   Credit: card_pool
   */
  async postCardCaptureNew({
    transactionId,
    cardId,
    splits,
    metadata,
  }: {
    transactionId: string;
    cardId: string;
    splits: Array<{ userId: string; amount: number }>;
    metadata?: any;
  }) {
    const pool = await this.getCardPoolAccount(cardId);

    const entries: Array<{
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
      metadata?: any;
    }> = [];

    for (const split of splits) {
      const equity = await this.getCardMemberEquityAccount(cardId, split.userId);

      entries.push({
        debitAccountId: equity.id,
        creditAccountId: pool.id,
        amount: split.amount,
        metadata: {
          type: "card_capture",
          cardId,
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
