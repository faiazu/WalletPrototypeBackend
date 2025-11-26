import { randomUUID } from "crypto";
import { prisma } from "../core/db.js";
import type { Wallet } from "../generated/prisma/client.js";
import { initializeLedgerForWallet, type LedgerInitializationResult } from "./ledgerService.js";

type CreateWalletInput = {
  name: string;
  adminId: string;
};

export type CreateWalletResult = { wallet: Wallet; ledger: LedgerInitializationResult };

export async function createWallet(data: CreateWalletInput): Promise<CreateWalletResult> {
  const wallet = await prisma.wallet.create({
    data: {
      name: data.name,
      adminId: data.adminId,
      walletBalance: {
        create: {
          id: randomUUID(),
          amount: 0,
        },
      },
    },
  });

  const ledger = await initializeLedgerForWallet(wallet.id, data.adminId);

  return { wallet, ledger };
}

export async function getWalletById(id: string): Promise<Wallet | null> {
  return prisma.wallet.findUnique({ where: { id } });
}

export async function requireWallet(id: string): Promise<Wallet> {
  const wallet = await getWalletById(id);
  if (!wallet) {
    throw new Error("Wallet not found");
  }
  return wallet;
}

export async function isWalletAdmin(walletId: string, userId: string): Promise<boolean> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { adminId: true },
  });

  return wallet?.adminId === userId;
}

export async function getWalletDetails(walletId: string) {
  return prisma.wallet.findUnique({
    where: { id: walletId },
    include: {
      walletBalance: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      },
    },
  });
}
