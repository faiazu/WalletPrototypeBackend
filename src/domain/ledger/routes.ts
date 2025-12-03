import { Router } from "express";

import {
  // New card-centric endpoints
  postCardDeposit,
  postCardWithdraw,
  postCardCaptureNew,
  getCardReconciliation,
  // Legacy wallet-centric endpoints (deprecated)
  postDeposit,
  postWithdraw,
  postCardCapture,
  postAdjustment,
  getReconciliation,
} from "./controller.js";

const router = Router();

// ============================================
// NEW CARD-CENTRIC ROUTES
// ============================================
router.post("/cards/:cardId/deposit", postCardDeposit);
router.post("/cards/:cardId/withdraw", postCardWithdraw);
router.post("/cards/:cardId/capture", postCardCaptureNew);
router.get("/cards/:cardId/reconciliation", getCardReconciliation);

// ============================================
// DEPRECATED WALLET-CENTRIC ROUTES (410 Gone)
// ============================================
const deprecatedEndpoint = (req: any, res: any) => {
  res.status(410).json({
    error: "Endpoint deprecated",
    message: "Wallet-level ledger endpoints have been replaced with card-centric endpoints. Use /ledger/cards/:cardId/* instead.",
    migration: {
      "/ledger/:walletId/deposit": "/ledger/cards/:cardId/deposit",
      "/ledger/:walletId/withdraw": "/ledger/cards/:cardId/withdraw",
      "/ledger/:walletId/card-capture": "/ledger/cards/:cardId/capture",
      "/ledger/:walletId/reconciliation": "/ledger/cards/:cardId/reconciliation",
    }
  });
};

router.post("/:walletId/deposit", deprecatedEndpoint);
router.post("/:walletId/withdraw", deprecatedEndpoint);
router.post("/:walletId/card-capture", deprecatedEndpoint);
router.post("/:walletId/adjustment", postAdjustment); // Keep adjustment for now (internal use)
router.get("/:walletId/reconciliation", deprecatedEndpoint);

export { router as ledgerRoutes };
