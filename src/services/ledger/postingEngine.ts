import { prisma } from "../../core/db.js";
import type { LedgerAccount, LedgerEntry } from "../../generated/prisma/client.js";

export interface PostingInput {
  transactionId: string;
  entries: Array<{
    debitAccountId: string;
    creditAccountId: string;
    amount: number; // positive integer in cents
    metadata?: any;
  }>;
}

export interface PostingResult {
  entries: LedgerEntry[];
  accounts: LedgerAccount[];
}

export const postingEngine = {
  async post(input: PostingInput): Promise<PostingResult> {
    const { transactionId, entries } = input;

    if (!transactionId || transactionId.trim().length === 0) {
      throw new Error("MissingTransactionId");
    }

    if (!entries || entries.length === 0) {
      throw new Error("NoPostingsProvided");
    }

    return prisma.$transaction(async (tx) => {
      // 
      // 1. IDEMPOTENCY CHECK
      // 
      const existing = await tx.ledgerEntry.findMany({
        where: { transactionId }
      });

      if (existing.length > 0) {
        // Return existing ledger entries + affected account states
        const affectedIds = [
          ...new Set(
            existing.map((e) => e.debitAccountId).concat(existing.map((e) => e.creditAccountId))
          )
        ];

        const accounts = await tx.ledgerAccount.findMany({
          where: { id: { in: affectedIds } }
        });

        return {
          entries: existing,
          accounts
        };
      }

      // 
      // 2. VALIDATE DOUBLE-ENTRY
      // 
      let totalDebits = 0;
      let totalCredits = 0;

      for (const e of entries) {
        if (!e.debitAccountId || !e.creditAccountId) {
          throw new Error("MissingLedgerAccountId");
        }
        if (e.amount <= 0) {
          throw new Error("InvalidPostingAmount");
        }

        // amounts always positive
        totalDebits += e.amount;
        totalCredits += e.amount;
      }

      if (totalDebits !== totalCredits) {
        throw new Error("DoubleEntryImbalance");
      }

      // 
      // 3. ENSURE ALL LEDGER ACCOUNTS EXIST
      // 
      const allAccountIds = [
        ...new Set(entries.map(e => e.debitAccountId).concat(entries.map(e => e.creditAccountId)))
      ];

      const accountsFound = await tx.ledgerAccount.findMany({
        where: { id: { in: allAccountIds } }
      });

      if (accountsFound.length !== allAccountIds.length) {
        throw new Error("LedgerAccountNotFound");
      }

      // -----------------------------------------------------------
      // 4. CREATE POSTINGS (LedgerEntry rows)
      // -----------------------------------------------------------
      const createdEntries: LedgerEntry[] = [];

      for (const e of entries) {
        const entry = await tx.ledgerEntry.create({
          data: {
            transactionId,
            debitAccountId: e.debitAccountId,
            creditAccountId: e.creditAccountId,
            amount: e.amount,
            metadata: e.metadata || null
          }
        });

        createdEntries.push(entry);

        // update balances
        await tx.ledgerAccount.update({
          where: { id: e.debitAccountId },
          data: { balance: { decrement: e.amount } }
        });

        await tx.ledgerAccount.update({
          where: { id: e.creditAccountId },
          data: { balance: { increment: e.amount } }
        });
      }

      // 
      // 5. RETURN AFFECTED ACCOUNT SNAPSHOT
      // 
      const updatedAccounts = await tx.ledgerAccount.findMany({
        where: { id: { in: allAccountIds } }
      });

      return {
        entries: createdEntries,
        accounts: updatedAccounts
      };
    });
  }
};
