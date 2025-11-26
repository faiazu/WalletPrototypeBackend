import { prisma } from "../core/db.js";
import type { LedgerAccount } from "../generated/prisma/client.js";

export type LedgerInitializationResult = {
  walletPoolAccount: LedgerAccount;
  memberAccounts: LedgerAccount[];
};

export async function initializeLedgerForWallet(walletId: string, adminUserId: string): Promise<LedgerInitializationResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) {
        throw new Error("WalletNotFoundError");
      }

      let poolAccount = await tx.ledgerAccount.findFirst({
        where: { walletId, type: "wallet_pool" },
      });

      if (!poolAccount) {
        poolAccount = await tx.ledgerAccount.create({
          data: {
            walletId,
            userId: null,
            type: "wallet_pool",
            balance: 0,
          },
        });
      }

      let adminAccount = await tx.ledgerAccount.findFirst({
        where: { walletId, userId: adminUserId, type: "member_equity" },
      });

      if (!adminAccount) {
        adminAccount = await tx.ledgerAccount.create({
          data: {
            walletId,
            userId: adminUserId,
            type: "member_equity",
            balance: 0,
          },
        });
      }

      return {
        walletPoolAccount: poolAccount,
        memberAccounts: [adminAccount],
      };
    });
  } catch (err: any) {
    if (err?.message === "WalletNotFoundError") {
      throw err;
    }

    console.error("Failed to initialize ledger accounts:", err);
    throw new Error("LedgerInitializationFailed");
  }
}
