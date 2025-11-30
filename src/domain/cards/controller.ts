import type { Request, Response } from "express";

import { Debugger } from "../../core/debugger.js";
import { prisma } from "../../core/db.js";
import { baasService } from "../../core/dependencies.js";
import { BaasProviderName } from "../../generated/prisma/enums.js";
import { authMiddleware } from "../../core/authMiddleware.js";
import { syncteraWidgetService } from "../../services/baas/synctera/syncteraWidgetService.js";
import { issueCardParamsSchema, widgetQuerySchema } from "./validator.js";
import { isMember } from "../../services/wallet/memberService.js";
import { ledgerService } from "../../services/ledger/ledgerService.js";

/**
 * Issue a card for the authenticated user and link to wallet.
 */
export const issueCard = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { walletId } = issueCardParamsSchema.parse({ walletId: req.params.walletId });
      const card = await baasService.createCardForUser(userId, walletId);

      return res.status(201).json(card);
    } catch (err: any) {
      if (err?.message === "UserNotMemberOfWallet") {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }
      if (err?.message === "AccountCreationNotSupported") {
        return res.status(400).json({ error: "AccountCreationNotSupported" });
      }
      if (typeof err?.message === "string" && err.message.includes("Synctera card issuance")) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: err?.message ?? "Failed to issue card" });
    }
  },
];

/**
 * Internal helper to authorize card access and gather Synctera identifiers.
 */
async function resolveCardContext(cardId: string, userId: string): Promise<{
  baasCardId: string;
  externalCardId: string;
  walletId: string;
  accountId: string;
  customerId: string;
  cardHolderName?: string | null;
}> {
  const card = await prisma.baasCard.findFirst({
    where: {
      externalCardId: cardId,
      providerName: BaasProviderName.SYNCTERA,
    },
    include: {
      wallet: true,
    },
  });

  if (!card || !card.walletId) {
    throw new Error("CardNotFound");
  }

  const walletMember = await prisma.walletMember.findFirst({
    where: { walletId: card.walletId, userId },
  });
  if (!walletMember) {
    throw new Error("UserNotMemberOfWallet");
  }

  const account = card.baasAccountId
    ? await prisma.baasAccount.findUnique({ where: { id: card.baasAccountId } })
    : await prisma.baasAccount.findFirst({
        where: {
          walletId: card.walletId,
          userId: card.userId,
          providerName: BaasProviderName.SYNCTERA,
        },
      });

  if (!account) {
    throw new Error("AccountNotFound");
  }

  const customer = card.baasCustomerId
    ? await prisma.baasCustomer.findUnique({ where: { id: card.baasCustomerId } })
    : await prisma.baasCustomer.findFirst({
        where: {
          userId: card.userId,
          providerName: BaasProviderName.SYNCTERA,
        },
      });

  if (!customer) {
    throw new Error("CustomerNotFound");
  }

  return {
    baasCardId: card.id,
    externalCardId: card.externalCardId,
    walletId: card.walletId,
    accountId: account.externalAccountId,
    customerId: customer.externalCustomerId,
    cardHolderName: card.user?.name ?? null,
  };
}

/**
 * GET widget URL for activation or set_pin.
 */
export const getWidgetUrl = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      // Wallet membership check
      const card = await prisma.baasCard.findFirst({
        where: { externalCardId: cardId },
      });
      if (!card || !card.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (!(await isMember(card.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      const { widgetType } = widgetQuerySchema.parse({
        widgetType: req.query.widgetType,
      });
      const normalizedWidgetType = widgetType ?? "set_pin";

      const ctx = await resolveCardContext(cardId, userId);
      const result = await syncteraWidgetService.getCardWidgetUrl({
        cardId: ctx.externalCardId,
        accountId: ctx.accountId,
        customerId: ctx.customerId,
        widgetType: normalizedWidgetType,
      });

      Debugger.logInfo(
        `[CardRoutes] Widget URL generated for card=${ctx.externalCardId}, widgetType=${normalizedWidgetType}`
      );

      return res.status(200).json(result);
    } catch (err: any) {
      if (err?.message === "UserNotMemberOfWallet") {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }
      if (err?.message === "CardNotFound") {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (err?.message === "AccountNotFound" || err?.message === "CustomerNotFound") {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: err?.message ?? "Failed to get widget URL" });
    }
  },
];

/**
 * POST client token for PAN/PIN widget usage.
 */
export const postClientToken = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const card = await prisma.baasCard.findFirst({
        where: { externalCardId: cardId },
      });
      if (!card || !card.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (!(await isMember(card.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      const ctx = await resolveCardContext(cardId, userId);

      const result = await syncteraWidgetService.getClientAccessToken({
        cardId: ctx.externalCardId,
      });

      Debugger.logInfo(
        `[CardRoutes] Client token generated for card=${ctx.externalCardId}`
      );

      return res.status(201).json(result);
    } catch (err: any) {
      if (err?.message === "UserNotMemberOfWallet") {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }
      if (err?.message === "CardNotFound") {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (err?.message === "AccountNotFound" || err?.message === "CustomerNotFound") {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: err?.message ?? "Failed to get client token" });
    }
  },
];

/**
 * POST single-use token for one-time widget interactions.
 */
export const postSingleUseToken = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const card = await prisma.baasCard.findFirst({
        where: { externalCardId: cardId },
      });
      if (!card || !card.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (!(await isMember(card.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      const ctx = await resolveCardContext(cardId, userId);

      const result = await syncteraWidgetService.getSingleUseToken({
        accountId: ctx.accountId,
        customerId: ctx.customerId,
      });

      Debugger.logInfo(
        `[CardRoutes] Single-use token generated for account=${ctx.accountId}`
      );

      return res.status(201).json(result);
    } catch (err: any) {
      if (err?.message === "UserNotMemberOfWallet") {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }
      if (err?.message === "CardNotFound") {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (err?.message === "AccountNotFound" || err?.message === "CustomerNotFound") {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: err?.message ?? "Failed to get single-use token" });
    }
  },
];

/**
 * GET card details (status, holder, wallet, balances).
 */
export const getCardDetails = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const card = await prisma.baasCard.findFirst({
        where: { externalCardId: cardId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      if (!card || !card.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (!(await isMember(card.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      const balances = await ledgerService.getWalletDisplayBalances(card.walletId);

      return res.status(200).json({
        card: {
          id: card.id,
          externalCardId: card.externalCardId,
          walletId: card.walletId,
          status: card.status,
          last4: card.last4,
          providerName: card.providerName,
          user: card.user,
          createdAt: card.createdAt,
          updatedAt: card.updatedAt,
          // expiry not stored; null for now
          expiryMonth: null,
          expiryYear: null,
        },
        balances,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || "Failed to fetch card" });
    }
  },
];

/**
 * PATCH card status (lock/unlock/deactivate) for wallet members.
 */
export const updateCardStatus = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const parsed = (req.body && req.body.status) ? req.body.status : undefined;
      const status = typeof parsed === "string" ? parsed.toUpperCase() : undefined;
      if (!status || !["ACTIVE", "LOCKED", "CANCELED", "SUSPENDED"].includes(status)) {
        return res.status(400).json({ error: "InvalidStatus", message: "Status must be one of ACTIVE, LOCKED, CANCELED, SUSPENDED" });
      }

      const card = await prisma.baasCard.findFirst({
        where: { externalCardId: cardId },
      });
      if (!card || !card.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (!(await isMember(card.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      await baasService.updateCardStatus(cardId, status);

      return res.status(200).json({ status });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || "Failed to update card status" });
    }
  },
];
