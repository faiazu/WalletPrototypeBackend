import { Router } from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { listWalletCards } from "./walletController.js";

const router = Router({ mergeParams: true });

router.get("/", authMiddleware, listWalletCards);

export { router as walletCardsRoutes };
