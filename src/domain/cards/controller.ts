import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";
import { createCardSchema } from "./validator.js";
import { CardProvider, CardStatus, CardType, Currency } from "../../generated/prisma/client.js";
import { isWalletMember, isWalletAdmin } from "../wallet/service.js";

async function ensureAccountForUser(userId: string, currency: Currency) {
  const existing = await prisma.account.findFirst({
    where: {
      userId,
      currency,
    },
    include: { card: true },
  });

  if (existing) {
    if (existing.card) {
      throw new Error("AccountAlreadyLinkedToCard");
    }
    return existing;
  }

  return prisma.account.create({
    data: {
      userId,
      currency,
      cachedBalanceCents: BigInt(0),
    },
  });
}

export const createCardHandler = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const walletId = req.params.walletId!;
      const userId = req.userId!;
      const parsed = createCardSchema.parse(req.body);

      const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) {
        return res.status(404).json({ error: "WalletNotFound" });
      }

      const requesterCanManage =
        (await isWalletAdmin(walletId, userId)) || (await isWalletMember(walletId, userId));
      if (!requesterCanManage) {
        return res.status(403).json({ error: "AccessDenied" });
      }

      const holderIsMember = await isWalletMember(walletId, parsed.holderUserId);
      if (!holderIsMember) {
        return res.status(400).json({ error: "HolderMustBeMember" });
      }

      const account = await ensureAccountForUser(parsed.holderUserId, parsed.currency as Currency);

      const card = await prisma.card.create({
        data: {
          walletId,
          accountId: account.id,
          holderUserId: parsed.holderUserId,
          type: parsed.type as CardType,
          brand: parsed.brand ?? null,
          last4: parsed.last4,
          expMonth: parsed.expMonth,
          expYear: parsed.expYear,
          status: CardStatus.PENDING_ACTIVATION,
          cardholderName: parsed.cardholderName,
          provider: CardProvider.SYNCTERA,
          providerCardId: `card_${randomUUID()}`,
          providerAccountId: `acct_${randomUUID()}`,
          providerCustomerId: `cust_${randomUUID()}`,
          widgetTypes: parsed.widgetTypes,
        },
      });

      return res.status(201).json({ card });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "InvalidRequest", details: err.errors });
      }
      if (err?.message === "AccountAlreadyLinkedToCard") {
        return res.status(409).json({ error: "AccountAlreadyLinkedToCard" });
      }
      return res.status(400).json({ error: err?.message ?? "Failed to create card" });
    }
  },
];

export const listCardsHandler = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const walletId = req.params.walletId!;
      const userId = req.userId!;

      const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) {
        return res.status(404).json({ error: "WalletNotFound" });
      }

      const canView =
        (await isWalletAdmin(walletId, userId)) || (await isWalletMember(walletId, userId));
      if (!canView) {
        return res.status(403).json({ error: "AccessDenied" });
      }

      const cards = await prisma.card.findMany({
        where: { walletId },
        include: {
          holder: {
            select: { id: true, email: true, fullName: true },
          },
          account: {
            select: { id: true, currency: true, cachedBalanceCents: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return res.json({ cards });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message ?? "Failed to list cards" });
    }
  },
];

