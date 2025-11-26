import express from "express";
import { z } from "zod";

import { ledgerService } from "../../../../services/ledger/ledgerService.js";
import { walletService } from "../../../../services/walletService.js";
import { isMember } from "../../../../services/memberService.js";
import { authMiddleware } from "../../../../core/authMiddleware.js";

const router = express.Router();

const cardCaptureSchema = z.object({
  splits: z.array(
    z.object({
      userId: z.string(),
      amount: z.number().positive(),
    })
  ),
});

//
// MOCK CARD CAPTURE (split transaction)
//
router.post("/:walletId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    const { splits } = cardCaptureSchema.parse(req.body);

    const wallet = await walletService.getWalletById(walletId);
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const transactionId = `mock_card_capture_${walletId}_${Date.now()}`;

    const result = await ledgerService.postCardCapture({
      transactionId,
      walletId,
      splits,
      metadata: { mock: true },
    });

    return res.json({
      message: "Mock card capture successful",
      transactionId,
      ledger: result,
    });

  } catch (err: any) {
    console.error("Mock card capture error:", err);
    return res.status(400).json({
      error: err.message || "Mock card capture failed"
    });
  }
});

export { router as mockCardCaptureRoutes };
