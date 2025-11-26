import { prisma } from "../../core/db.js";
import type { LedgerAccount } from "../../generated/prisma/client.js";

/*
 Initializes the ledger structure for a new wallet.
 Creates:
 - wallet_pool ledger account
 - admin member_equity ledger account

 Idempotent: If accounts already exist, returns them.
*/
export async function initializeLedgerForWallet(walletId: string, adminUserId: string): Promise<{
  walletPoolAccount: LedgerAccount,
  memberAccounts: LedgerAccount[]
}> {
  return prisma.$transaction(async (tx) => {

    //
    // 1. Validate wallet exists
    //
    const wallet = await tx.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new Error("WalletNotFound");
    }

    //
    // 2. Lookup or create wallet_pool account
    //
    let poolAccount = await tx.ledgerAccount.findFirst({
      where: {
        walletId,
        type: "wallet_pool",
        userId: null
      }
    });

    if (!poolAccount) {
      poolAccount = await tx.ledgerAccount.create({
        data: {
          walletId,
          type: "wallet_pool",
          userId: null,
          balance: 0
        }
      });
    }

    //
    // 3. Lookup or create admin member_equity account
    //
    let adminAccount = await tx.ledgerAccount.findFirst({
      where: {
        walletId,
        userId: adminUserId,
        type: "member_equity"
      }
    });

    if (!adminAccount) {
      adminAccount = await tx.ledgerAccount.create({
        data: {
          walletId,
          userId: adminUserId,
          type: "member_equity",
          balance: 0
        }
      });
    }

    //
    // 4. Return both accounts
    //
    return {
      walletPoolAccount: poolAccount,
      memberAccounts: [adminAccount]
    };
  });
}
