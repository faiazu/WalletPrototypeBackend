import { Router } from "express";
import { authMiddleware } from "../core/authMiddleware.js";
import { baasService } from "../core/dependencies.js";

const router = Router();

/**
 * POST /cards
 *
 * Creates a card for the authenticated user at the BaaS (mock for now)
 * and stores the mapping in BaasCustomer + BaasCard tables.
 *
 * Response:
 *  {
 *    provider: "MOCK",
 *    externalCardId: "mock_card_<userId>",
 *    last4: "4242"
 *  }
 */
router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const card = await baasService.createCardForUser(userId);

    return res.status(201).json({
      provider: card.provider,
      externalCardId: card.externalCardId,
      last4: card.last4,
    });
  } 
  catch (err) {
    next(err);
  }
});

export { router as cardRouter };
