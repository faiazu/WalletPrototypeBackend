import express from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";

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
          select: { walletId: true },
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
    wallets,
  });
});

export { router as userRoutes };
