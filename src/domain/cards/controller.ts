import type { Request, Response } from "express";

import { Debugger } from "../../core/debugger.js";
import { prisma } from "../../core/db.js";
import { baasService } from "../../core/dependencies.js";
import { BaasProviderName } from "../../generated/prisma/enums.js";
import { authMiddleware } from "../../core/authMiddleware.js";
import { syncteraWidgetService } from "../../services/baas/synctera/syncteraWidgetService.js";
import {
  issueCardBodySchema,
  issueCardParamsSchema,
  updateCardNicknameSchema,
  widgetQuerySchema,
} from "./validator.js";
import { isMember } from "../../services/wallet/memberService.js";
import { ledgerService } from "../../services/ledger/ledgerService.js";
import { LedgerScope } from "../../generated/prisma/enums.js";

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
      const { nickname } = issueCardBodySchema.parse(req.body ?? {});
      const card = await baasService.createCardForUser(userId, walletId, { nickname });

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
  // Accept either internal ID or externalCardId
  const card = await prisma.baasCard.findFirst({
    where: {
      OR: [
        { id: cardId }, // Internal database ID
        { externalCardId: cardId }, // Synctera's external ID
      ],
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
        where: {
          OR: [
            { id: cardId },
            { externalCardId: cardId },
          ],
        },
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
        where: {
          OR: [
            { id: cardId },
            { externalCardId: cardId },
          ],
        },
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
        where: {
          OR: [
            { id: cardId },
            { externalCardId: cardId },
          ],
        },
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
 * Returns card-specific balances, not wallet-level.
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

      // Try to find by internal ID first, then fall back to externalCardId
      const baasCard = await prisma.baasCard.findFirst({
        where: {
          OR: [
            { id: cardId }, // Internal database ID
            { externalCardId: cardId }, // Synctera's external ID
          ],
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      if (!baasCard || !baasCard.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }
      if (!(await isMember(baasCard.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      // Find the internal Card record using the external card ID
      const internalCard = await prisma.card.findFirst({
        where: {
          walletId: baasCard.walletId,
          providerCardId: baasCard.externalCardId,
        },
      });

      if (!internalCard) {
        return res.status(404).json({ error: "InternalCardNotFound" });
      }

      // Get CARD-SPECIFIC balances, not wallet balances
      const cardPoolAccount = await ledgerService.getCardPoolAccount(internalCard.id);
      const cardMemberEquityAccounts = await prisma.ledgerAccount.findMany({
        where: {
          cardId: internalCard.id,
          ledgerScope: "CARD_MEMBER_EQUITY",
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      // Pool balance is stored as negative (liability), display as positive
      const poolBalanceDisplay = -cardPoolAccount.balance;

      const memberEquities = cardMemberEquityAccounts.map((acc) => ({
        userId: acc.userId!,
        userEmail: acc.user?.email,
        userName: acc.user?.name,
        balance: acc.balance,
      }));

      return res.status(200).json({
        card: {
          id: baasCard.id,
          externalCardId: baasCard.externalCardId,
          internalCardId: internalCard.id,
          walletId: baasCard.walletId,
          status: baasCard.status,
          last4: baasCard.last4,
          providerName: baasCard.providerName,
          user: baasCard.user,
          createdAt: baasCard.createdAt,
          updatedAt: baasCard.updatedAt,
          nickname: baasCard.nickname,
          expiryMonth: null,
          expiryYear: null,
        },
        balances: {
          poolDisplay: poolBalanceDisplay,
          memberEquity: memberEquities,
        },
      });
    } catch (err: any) {
      Debugger.logError(`[getCardDetails] Error: ${err?.message}`);
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
        where: {
          OR: [
            { id: cardId },
            { externalCardId: cardId },
          ],
        },
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

/**
 * PATCH card nickname for wallet members.
 */
export const updateCardNickname = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const { nickname } = updateCardNicknameSchema.parse(req.body ?? {});

      const card = await prisma.baasCard.findFirst({
        where: {
          OR: [
            { id: cardId },
            { externalCardId: cardId },
          ],
        },
      });

      if (!card || !card.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }

      if (!(await isMember(card.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      const updated = await prisma.baasCard.update({
        where: { id: card.id },
        data: { nickname },
        select: {
          externalCardId: true,
          nickname: true,
          status: true,
          last4: true,
        },
      });

      return res.status(200).json({
        card: {
          externalCardId: updated.externalCardId,
          nickname: updated.nickname,
          status: updated.status,
          last4: updated.last4,
        },
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ error: "InvalidNickname", details: err.errors });
      }
      return res.status(400).json({ error: err?.message || "Failed to update card nickname" });
    }
  },
];

/**
 * POST /cards/:cardId/terminate - Terminate a card (requires $0 balance)
 */
export const terminateCard = [
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const baasCard = await prisma.baasCard.findFirst({
        where: {
          OR: [
            { id: cardId },
            { externalCardId: cardId },
          ],
        },
      });

      if (!baasCard || !baasCard.walletId) {
        return res.status(404).json({ error: "CardNotFound" });
      }

      if (!(await isMember(baasCard.walletId, userId))) {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }

      // Find internal Card record
      const internalCard = await prisma.card.findFirst({
        where: {
          walletId: baasCard.walletId,
          providerCardId: cardId,
        },
      });

      if (!internalCard) {
        return res.status(404).json({ error: "InternalCardNotFound" });
      }

      // Check if already terminated
      if (internalCard.terminatedAt) {
        return res.status(400).json({ 
          error: "CardAlreadyTerminated",
          terminatedAt: internalCard.terminatedAt
        });
      }

      // Get all card ledger accounts
      const cardPoolAccount = await ledgerService.getCardPoolAccount(internalCard.id);
      const memberEquityAccounts = await prisma.ledgerAccount.findMany({
        where: {
          cardId: internalCard.id,
          ledgerScope: LedgerScope.CARD_MEMBER_EQUITY,
        },
      });
      const pendingAccount = await prisma.ledgerAccount.findFirst({
        where: {
          cardId: internalCard.id,
          ledgerScope: LedgerScope.CARD_PENDING_WITHDRAWAL,
        },
      });

      // Verify ALL balances are zero
      if (cardPoolAccount.balance !== 0) {
        return res.status(400).json({
          error: "CannotTerminateNonZeroBalance",
          message: "Card pool balance must be $0.00 to terminate",
          poolBalance: -cardPoolAccount.balance, // Display as positive
        });
      }

      const totalMemberEquity = memberEquityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
      if (totalMemberEquity !== 0) {
        return res.status(400).json({
          error: "CannotTerminateNonZeroBalance",
          message: "Member equity must be $0.00 to terminate",
          memberEquityTotal: totalMemberEquity,
        });
      }

      if (pendingAccount && pendingAccount.balance !== 0) {
        return res.status(400).json({
          error: "CannotTerminateNonZeroBalance",
          message: "Pending withdrawals must be $0.00 to terminate",
          pendingBalance: pendingAccount.balance,
        });
      }

      // Archive ledger state
      const balanceSnapshot = {
        poolBalance: cardPoolAccount.balance,
        memberEquities: memberEquityAccounts.map(acc => ({
          userId: acc.userId!,
          balance: acc.balance,
        })),
        pendingWithdrawals: pendingAccount?.balance || 0,
      };

      await prisma.cardArchive.create({
        data: {
          cardId: internalCard.id,
          walletId: baasCard.walletId,
          userId: baasCard.userId,
          externalAccountId: baasCard.baasAccount?.externalAccountId,
          externalCardId: baasCard.externalCardId,
          balanceSnapshot,
          terminatedAt: new Date(),
          reason: req.body?.reason || "User-initiated termination",
          metadata: {
            last4: baasCard.last4,
            nickname: baasCard.nickname,
          },
        },
      });

      // Mark card as terminated
      const now = new Date();
      await prisma.card.update({
        where: { id: internalCard.id },
        data: {
          status: "TERMINATED",
          terminatedAt: now,
          archivedAt: now,
          archivedReason: req.body?.reason || "User-initiated termination",
        },
      });

      // Update BaaS card status
      await baasService.updateCardStatus(cardId, "CANCELED");

      // TODO: Close Synctera account (requires Synctera API support)

      Debugger.logInfo(
        `[terminateCard] Card terminated: cardId=${internalCard.id}, externalCardId=${cardId}`
      );

      return res.status(200).json({
        message: "Card terminated successfully",
        cardId: internalCard.id,
        externalCardId: cardId,
        terminatedAt: now,
      });
    } catch (err: any) {
      Debugger.logError(`[terminateCard] Error: ${err?.message}`);
      return res.status(500).json({ error: err?.message || "Failed to terminate card" });
    }
  },
];
