import { prisma } from "../../core/db.js";
import { initializeLedgerForWallet } from "../ledger/initLedger.js";

export const walletService = {
  async createWallet({
    name,
    adminUserId,
  }: {
    name: string;
    adminUserId: string;
  }) {
    // Ensure admin user exists to avoid FK violations
    const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
    if (!admin) {
      throw new Error("AdminUserNotFound");
    }

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.create({
        data: {
          name,
          adminId: adminUserId,
        },
      });

      await tx.walletMember.create({
        data: {
          walletId: wallet.id,
          userId: adminUserId,
          role: "admin",
        },
      });

      const ledger = await initializeLedgerForWallet(tx, wallet.id, adminUserId);

      return { wallet, ledger };
    });
  },

  async getWalletById(walletId: string) {
    return prisma.wallet.findUnique({
      where: { id: walletId },
    });
  },

  async getWalletDetails(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        members: {
          include: { user: true },
        },
        ledgerAccounts: true,
      },
    });

    return wallet;
  },

  async isWalletAdmin(walletId: string, userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) return false;
    return wallet.adminId === userId;
  },
};
