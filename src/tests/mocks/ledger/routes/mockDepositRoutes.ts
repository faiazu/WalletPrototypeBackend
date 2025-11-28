import express from "express";
import { z } from "zod";

import { ledgerService } from "../../../../services/ledger/ledgerService.js";
import { walletService } from "../../../../services/wallet/walletService.js";
import { isMember } from "../../../../services/wallet/memberService.js";
import { authMiddleware } from "../../../../core/authMiddleware.js";

const router = express.Router();

const amountSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
});

//
// MOCK DEPOSIT
//
router.post("/:walletId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    const { amount } = amountSchema.parse(req.body);

    const wallet = await walletService.getWalletById(walletId);
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const transactionId = `mock_deposit_${walletId}_${userId}_${Date.now()}`;

    const result = await ledgerService.postDeposit({
      transactionId,
      walletId,
      userId,
      amount,
      metadata: { mock: true },
    });

    return res.json({
      message: "Mock deposit successful",
      transactionId,
      ledger: result,
    });

  } catch (err: any) {
    console.error("Mock deposit error:", err);
    return res.status(400).json({
      error: err.message || "Mock deposit failed"
    });
  }
});

export { router as mockDepositRoutes };
