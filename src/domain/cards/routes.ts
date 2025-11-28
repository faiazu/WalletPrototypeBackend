import { Router } from "express";

import {
  getWidgetUrl,
  issueCard,
  postClientToken,
  postSingleUseToken,
} from "./controller.js";

const router = Router();

router.post("/wallets/:walletId/cards", issueCard);
router.get("/cards/:cardId/widget-url", getWidgetUrl);
router.post("/cards/:cardId/client-token", postClientToken);
router.post("/cards/:cardId/single-use-token", postSingleUseToken);

export { router as cardRoutes };
