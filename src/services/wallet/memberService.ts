import { prisma } from "../../core/db.js";
import type { WalletMember } from "../../generated/prisma/client.js";

export async function getMember(walletId: string, userId: string): Promise<WalletMember | null> {
  return prisma.walletMember.findFirst({
    where: {
      walletId,
      userId,
    },
  });
}

export async function isMember(walletId: string, userId: string): Promise<boolean> {
  const member = await getMember(walletId, userId);
  return Boolean(member);
}

export async function addMember(walletId: string, userId: string, role: string = "member"): Promise<WalletMember> {
  return prisma.$transaction(async (tx) => {
    const member = await tx.walletMember.create({
      data: {
        walletId,
        userId,
        role,
      },
    });

    await tx.ledgerAccount.create({
      data: {
        walletId,
        userId,
        type: "member_equity",
        balance: 0,
      },
    });

    return member;
  });
}
