import { Router } from "express";

import {
  getReconciliation,
  postAdjustment,
  postCardCapture,
  postDeposit,
  postWithdraw,
} from "./controller.js";

const router = Router();

router.post("/:walletId/deposit", postDeposit);
router.post("/:walletId/withdraw", postWithdraw);
router.post("/:walletId/card-capture", postCardCapture);
router.post("/:walletId/adjustment", postAdjustment);
router.get("/:walletId/reconciliation", getReconciliation);

export { router as ledgerRoutes };
