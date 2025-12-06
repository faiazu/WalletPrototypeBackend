import { prisma } from "../../core/db.js";
import { WalletRole } from "../../generated/prisma/client.js";

export type WalletSummary = {
  wallet: {
    id: string;
    name: string;
    adminUserId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  role: WalletRole;
};

async function userExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("UserNotFound");
  }
  return user;
}

export async function createWallet(name: string, adminUserId: string) {
  await userExists(adminUserId);

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.create({
      data: {
        name,
        adminUserId,
      },
    });

    await tx.walletMember.create({
      data: {
        walletId: wallet.id,
        userId: adminUserId,
        role: WalletRole.ADMIN,
      },
    });

    return wallet;
  });
}

export async function listWalletsForUser(userId: string): Promise<WalletSummary[]> {
  const memberships = await prisma.walletMember.findMany({
    where: { userId },
    include: {
      wallet: true,
    },
    orderBy: { joinedAt: "asc" },
  });

  return memberships.map((membership) => ({
    wallet: membership.wallet!,
    role: membership.role,
  }));
}

export async function getWalletById(walletId: string) {
  return prisma.wallet.findUnique({
    where: { id: walletId },
  });
}

export async function getWalletDetails(walletId: string) {
  return prisma.wallet.findUnique({
    where: { id: walletId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              phone: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
      cards: true,
    },
  });
}

export async function isWalletAdmin(walletId: string, userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return false;
  return wallet.adminUserId === userId;
}

export async function isWalletMember(walletId: string, userId: string) {
  const membership = await prisma.walletMember.findUnique({
    where: {
      walletId_userId: {
        walletId,
        userId,
      },
    },
  });

  return Boolean(membership);
}

export async function addWalletMember(walletId: string, userId: string, role: WalletRole) {
  await userExists(userId);

  return prisma.walletMember.create({
    data: {
      walletId,
      userId,
      role,
    },
  });
}

