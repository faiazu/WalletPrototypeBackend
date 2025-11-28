import { Router } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { baasService } from "../../core/dependencies.js";

const router = Router();

/**
 * POST /wallets/:walletId/cards
 * Issues a card for the authenticated user and links it to the wallet.
 */
router.post(
  "/wallets/:walletId/cards",
  authMiddleware,
  async (req, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const walletId = req.params.walletId;
      if (!walletId) {
        return res.status(400).json({ error: "Wallet ID is required" });
      }

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
      next(err);
    }
  }
);

export { router as cardIssueRoutes };
