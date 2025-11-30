import { Router } from "express";

import {
  getCardDetails,
  getWidgetUrl,
  issueCard,
  postClientToken,
  postSingleUseToken,
  updateCardStatus,
} from "./controller.js";
import { walletCardsRoutes } from "./routes.wallet.js";
import { authMiddleware } from "../../core/authMiddleware.js";

const router = Router();

router.post("/wallets/:walletId/cards", issueCard);
router.get("/cards/:cardId/widget-url", getWidgetUrl);
router.post("/cards/:cardId/client-token", postClientToken);
router.post("/cards/:cardId/single-use-token", postSingleUseToken);
router.use("/wallets/:walletId/cards", walletCardsRoutes);
router.get("/cards/:cardId", authMiddleware, getCardDetails);
router.patch("/cards/:cardId/status", authMiddleware, updateCardStatus);

export { router as cardRoutes };
