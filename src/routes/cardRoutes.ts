import { Router } from "express";
import { authMiddleware } from "../core/authMiddleware.js";
import { baasService } from "../core/dependencies.js";

const router = Router();

/**
 * POST /wallets/:walletId/cards
 *
 * Creates a card for the authenticated user for the given wallet.
 * - Requires the user to be a member of that wallet.
 * - Ties the resulting card to walletId in BaasCard.
 *
 * Response:
 *  {
 *    provider: "MOCK" | "STRIPE_ISSUING" | ...,
 *    externalCardId: "card_xxx",
 *    last4: "4242"
 *  }
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
    } 
    catch (err: any) {
      if (err?.message === "UserNotMemberOfWallet") {
        return res.status(403).json({ error: "UserNotMemberOfWallet" });
      }
      next(err);
    }
  }
);

export { router as cardRouter };
