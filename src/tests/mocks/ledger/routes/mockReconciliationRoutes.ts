import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { authMiddleware } from "../../../../core/authMiddleware.js";
import { walletService } from "../../../../services/walletService.js";
import { LedgerReconciliationService, type LedgerReconciliationResult } from "../../../../services/ledger/ledgerReconciliation.js";

const router = express.Router();

// Zod schema for params
const paramsSchema = z.object({
  walletId: z.string().min(1),
});

// GET /test/ledger/reconciliation/:walletId
router.get(
  "/:walletId",
  authMiddleware,
  async (
    req: Request<{ walletId: string }>,
    res: Response<LedgerReconciliationResult | { error: string }>
  ) => {
    try {
      const { walletId } = paramsSchema.parse(req.params);

      // Validate wallet exists
      const wallet = await walletService.getWalletById(walletId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Perform reconciliation
      const result = await LedgerReconciliationService.reconcile(walletId);

      return res.json(result);

    } 
    catch (err: unknown) {
      console.error("Reconciliation error:", err);

      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid walletId" });
      }

      if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
      }

      return res.status(500).json({ error: "Unknown error" });
    }
  }
);

export { router as mockReconciliationRoutes };
