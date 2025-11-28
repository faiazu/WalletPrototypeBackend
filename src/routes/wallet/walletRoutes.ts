import express from "express";
import { z } from "zod";

import { authMiddleware } from "../../core/authMiddleware.js";
import { addMember, isMember } from "../../services/memberService.js";
import { requireUserByEmail } from "../../services/userService.js";
import { walletService } from "../../services/walletService.js";

const router = express.Router();

const createWalletSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
});

const inviteSchema = z.object({
  email: z.email(),
  role: z.string().optional(),
});

// CREATE WALLET
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const { name } = createWalletSchema.parse(req.body);

    const result = await walletService.createWallet({
      name: name,
      adminUserId: userId,
    });

    return res.status(201).json(result);
  } catch (err: any) {
    if (err.name === "ZodError")
      return res.status(400).json({ error: "Invalid request body", details: err.errors });

    return res.status(400).json({ error: err.message || "Failed to create wallet" });
  }
});

// INVITE MEMBER
router.post("/:id/invite", authMiddleware, async (req, res) => {
  try {
    const userId: string = req.userId!;
    const walletId: string = req.params.id!;

    const { email, role } = inviteSchema.parse(req.body);

    const wallet = await walletService.getWalletById(walletId);
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    // permission check
    if (wallet.adminId !== userId)
      return res.status(403).json({ error: "Only admin can invite members" });

    const invitee = await requireUserByEmail(email);

    if (await isMember(walletId, invitee.id))
      return res.status(400).json({ error: "User already a member" });

    const member = await addMember(walletId, invitee.id, role || "member");

    return res.status(201).json({ member });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body", details: err.errors });
    }

    return res.status(400).json({ error: err.message || "Failed to invite member" });
  }
});

// JOIN WALLET
router.post("/:id/join", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.id!;

    const wallet = await walletService.getWalletById(walletId);
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    if (await isMember(walletId, userId))
      return res.status(400).json({ error: "Already a member" });

    const member = await addMember(walletId, userId, "member");

    return res.status(201).json({ member });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to join wallet" });
  }
});

// GET WALLET DETAILS
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.id!;

    const wallet = await walletService.getWalletDetails(walletId);
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    const admin = await walletService.isWalletAdmin(walletId, userId);
    const member = await isMember(walletId, userId);
    if (!admin && !member) return res.status(403).json({ error: "Access denied" });

    return res.json({ wallet });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to fetch wallet" });
  }
});

export { router as walletRouter };
