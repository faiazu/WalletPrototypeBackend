import { Router } from "express";
import { createCardHandler, listCardsHandler } from "./controller.js";

const router = Router();

router.post("/wallets/:walletId/cards", createCardHandler);
router.get("/wallets/:walletId/cards", listCardsHandler);

export { router as cardRoutes };

