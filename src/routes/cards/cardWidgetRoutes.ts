import { Router } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";
import { Debugger } from "../../core/debugger.js";
import { BaasProviderName } from "../../generated/prisma/enums.js";
import { syncteraWidgetService } from "../../services/baas/synctera/syncteraWidgetService.js";

const router = Router();

/**
 * Ensure the user is a member of the wallet linked to the card and
 * gather Synctera IDs needed for widget/token calls.
 */
async function resolveCardContext(cardId: string, userId: string): Promise<{
  baasCardId: string;
  externalCardId: string;
  walletId: string;
  accountId: string;
  customerId: string;
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
  };
}

/**
 * GET /cards/:cardId/widget-url?widgetType=activate_card|set_pin
 * Returns a widget URL for PCI-safe activation or PIN flows.
 */
router.get(
  "/cards/:cardId/widget-url",
  authMiddleware,
  async (req, res, next) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
      }

      const widgetTypeParam = (req.query.widgetType as string) ?? "set_pin";
      const widgetType =
        widgetTypeParam === "activate_card" ? "activate_card" : "set_pin";

      const ctx = await resolveCardContext(cardId, userId);
      const result = await syncteraWidgetService.getCardWidgetUrl({
        cardId: ctx.externalCardId,
        accountId: ctx.accountId,
        customerId: ctx.customerId,
        widgetType,
      });

      Debugger.logInfo(
        `[CardRoutes] Widget URL generated for card=${ctx.externalCardId}, widgetType=${widgetType}`
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
      next(err);
    }
  }
);

/**
 * POST /cards/:cardId/client-token
 * Returns a client token to use with Synctera PCI widgets (PAN/PIN display).
 */
router.post(
  "/cards/:cardId/client-token",
  authMiddleware,
  async (req, res, next) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
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
      next(err);
    }
  }
);

/**
 * POST /cards/:cardId/single-use-token
 * Returns a single-use token for one-time card widget interactions.
 */
router.post(
  "/cards/:cardId/single-use-token",
  authMiddleware,
  async (req, res, next) => {
    try {
      const userId = req.userId!;
      const cardId = req.params.cardId;
      if (!cardId) {
        return res.status(400).json({ error: "CardIdRequired" });
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
      next(err);
    }
  }
);

export { router as cardWidgetRoutes };
