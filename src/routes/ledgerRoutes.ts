import express from "express";
import { z } from "zod";

import { authMiddleware } from "../core/authMiddleware.js";
import { ledgerService } from "../services/ledger/ledgerService.js";
import { isMember } from "../services/memberService.js";

const router = express.Router();

const amountSchema = z.object({
  amount: z.number().int().positive("Amount must be a positive integer (minor units)"),
  metadata: z.any().optional(),
});

const cardCaptureSchema = z.object({
  splits: z
    .array(
      z.object({
        userId: z.string().min(1),
        amount: z.number().int().positive(),
      })
    )
    .min(1, "At least one split is required"),
  metadata: z.any().optional(),
});

const adjustmentSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().int().positive(),
  metadata: z.any().optional(),
});

// POST /ledger/:walletId/deposit
router.post("/:walletId/deposit", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const { amount, metadata } = amountSchema.parse(req.body);
    const transactionId = `deposit_${walletId}_${userId}_${Date.now()}`;

    const result = await ledgerService.postDeposit({
      transactionId,
      walletId,
      userId,
      amount,
      metadata,
    });

    return res.status(201).json({ transactionId, ledger: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid body", details: err.issues });
    }
    console.error("Deposit error:", err);
    return res.status(400).json({ error: err.message || "Deposit failed" });
  }
});

// POST /ledger/:walletId/withdraw
router.post("/:walletId/withdraw", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const { amount, metadata } = amountSchema.parse(req.body);
    const transactionId = `withdraw_${walletId}_${userId}_${Date.now()}`;

    const result = await ledgerService.postWithdrawal({
      transactionId,
      walletId,
      userId,
      amount,
      metadata,
    });

    return res.status(201).json({ transactionId, ledger: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid body", details: err.issues });
    }
    console.error("Withdraw error:", err);
    return res.status(400).json({ error: err.message || "Withdraw failed" });
  }
});

// POST /ledger/:walletId/card-capture
router.post("/:walletId/card-capture", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const { splits, metadata } = cardCaptureSchema.parse(req.body);
    const transactionId = `card_capture_${walletId}_${Date.now()}`;

    const result = await ledgerService.postCardCapture({
      transactionId,
      walletId,
      splits,
      metadata,
    });

    return res.status(201).json({ transactionId, ledger: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid body", details: err.issues });
    }
    console.error("Card capture error:", err);
    return res.status(400).json({ error: err.message || "Card capture failed" });
  }
});

// POST /ledger/:walletId/adjustment
router.post("/:walletId/adjustment", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const { fromAccountId, toAccountId, amount, metadata } = adjustmentSchema.parse(req.body);
    const transactionId = `adjustment_${walletId}_${Date.now()}`;

    const result = await ledgerService.postAdjustment({
      transactionId,
      fromAccountId,
      toAccountId,
      amount,
      metadata,
    });

    return res.status(201).json({ transactionId, ledger: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid body", details: err.issues });
    }
    console.error("Adjustment error:", err);
    return res.status(400).json({ error: err.message || "Adjustment failed" });
  }
});

export { router as ledgerRouter };
