import { prisma } from "../core/db.js";
import { initializeLedgerForWallet } from "./ledger/initLedger.js";

export const walletService = {

  //
  // CREATE WALLET 
  // - atomic operation that
  // - creates wallet
  // - adds admin as member
  // - initializes ledger (pool + admin equity)
  //
  async createWallet({
    name,
    adminUserId
  }: {
    name: string;
    adminUserId: string;
  }) {

    return prisma.$transaction(async (tx) => {

      // 1. Create wallet
      const wallet = await tx.wallet.create({
        data: {
          name,
          adminId: adminUserId
        }
      });

      // 2. Add admin as member
      await tx.walletMember.create({
        data: {
          walletId: wallet.id,
          userId: adminUserId,
          role: "admin"
        }
      });

      // 3. Initialize ledger accounts
      const ledger = await initializeLedgerForWallet(wallet.id, adminUserId);

      return {
        wallet,
        ledger
      };
    });
  },

  //
  // GET WALLET
  //
  async getWalletById(walletId: string) {
    return prisma.wallet.findUnique({
      where: { id: walletId }
    });
  },

  //
  // GET WALLET DETAILS (with membership & equity)
  //
  async getWalletDetails(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        members: {
          include: { user: true }
        },
        ledgerAccounts: true
      }
    });

    return wallet;
  },

  //
  // ADMIN CHECK
  //
  async isWalletAdmin(walletId: string, userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId }
    });

    if (!wallet) return false;
    return wallet.adminId === userId;
  }
};
