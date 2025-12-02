import express from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";
import { withdrawalService } from "../../services/wallet/withdrawalService.js";

const router = express.Router();

/**
 * GET /user/me
 * Returns the current authenticated user's id and email.
 */
router.get("/me", authMiddleware, async (req, res) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      kycStatus: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(user);
});

/**
 * GET /user/overview
 * Convenience endpoint for onboarding/dashboard: user profile + wallet summaries.
 */
router.get("/overview", authMiddleware, async (req, res) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      kycStatus: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const memberships = await prisma.walletMember.findMany({
    where: { userId },
    include: {
      wallet: {
        select: {
          id: true,
          name: true,
          adminId: true,
          createdAt: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const walletIds = memberships.map((m) => m.walletId);

  const [memberCounts, cardCounts, myWalletCards] = await Promise.all([
    walletIds.length
      ? prisma.walletMember.groupBy({
          by: ["walletId"],
          where: { walletId: { in: walletIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    walletIds.length
      ? prisma.baasCard.groupBy({
          by: ["walletId"],
          where: { walletId: { in: walletIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    walletIds.length
      ? prisma.baasCard.findMany({
          where: {
            walletId: { in: walletIds },
            userId,
          },
          select: {
            walletId: true,
            externalCardId: true,
            last4: true,
            status: true,
            providerName: true,
            nickname: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const memberCountMap = new Map<string, number>();
  for (const row of memberCounts) {
    memberCountMap.set(row.walletId, row._count._all);
  }

  const cardCountMap = new Map<string, number>();
  for (const row of cardCounts) {
    cardCountMap.set(row.walletId, row._count._all);
  }

  const myCardWalletIds = new Set<string>(myWalletCards.map((c) => c.walletId));

  // Fetch recent withdrawal history for the user (last 10)
  const withdrawals = await withdrawalService.getWithdrawalsByUser(userId, {
    limit: 10,
  });

  const wallets = memberships.map((membership) => {
    const wallet = membership.wallet!;
    return {
      id: wallet.id,
      name: wallet.name,
      role: membership.role,
      isAdmin: wallet.adminId === userId,
      memberCount: memberCountMap.get(wallet.id) ?? 1,
      cardCount: cardCountMap.get(wallet.id) ?? 0,
      hasCardForCurrentUser: myCardWalletIds.has(wallet.id),
      joinedAt: membership.joinedAt,
      createdAt: wallet.createdAt,
    };
  });

  return res.json({
    user,
    hasWallets: wallets.length > 0,
    requirements: {
      kycRequired: (user.kycStatus ?? "UNKNOWN") !== "ACCEPTED",
    },
    metadata: {
      defaultWalletName: process.env.DEFAULT_WALLET_NAME || "Household",
      isWalletAdmin: wallets.some((wallet) => wallet.isAdmin),
    },
    wallets,
    cardsForCurrentUser: myWalletCards.map((card) => ({
      walletId: card.walletId,
      externalCardId: card.externalCardId,
      last4: card.last4,
      status: card.status,
      providerName: card.providerName,
      nickname: card.nickname,
      createdAt: card.createdAt,
    })),
    recentWithdrawals: withdrawals.map((w) => ({
      id: w.id,
      walletId: w.walletId,
      walletName: w.wallet?.name,
      amountMinor: w.amountMinor,
      currency: w.currency,
      status: w.status,
      createdAt: w.createdAt,
      completedAt: w.completedAt,
      failedAt: w.failedAt,
      failureReason: w.failureReason,
    })),
  });
});

export { router as userRoutes };
