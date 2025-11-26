import express from "express";
import { z } from "zod";

import { authMiddleware } from "../../core/authMiddleware.js";
import { addMember, isMember } from "../../services/memberService.js";
import { requireUserByEmail } from "../../services/userService.js";
import {
  createWallet,
  getWalletDetails,
  getWalletById,
  isWalletAdmin,
} from "../../services/walletService.js";

const router = express.Router();

const createWalletSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
});

const inviteSchema = z.object({
  email: z.email(),
  role: z.string().min(1).optional(),
});

router.post("/create", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.userId as string;

    const { name } = createWalletSchema.parse(req.body);

    const { wallet, ledger } = await createWallet({ name, adminId: userId });

    // Ensure the creator is also recorded as a member with an admin role
    await addMember(wallet.id, userId, "admin");

    return res.status(201).json({ wallet, ledger });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body", details: err.errors });
    }

    console.error("Error creating wallet:", err);
    return res.status(400).json({ error: err.message ?? "Failed to create wallet" });
  }
});

router.post("/:id/invite", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.userId as string;

    const walletId = req.params.id ?? "";
    if (!walletId) {
      return res.status(400).json({ error: "Wallet id is required" });
    }
    const { email, role } = inviteSchema.parse(req.body);

    const wallet = await getWalletById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (wallet.adminId !== userId) {
      return res.status(403).json({ error: "Only the wallet admin can invite members" });
    }

    const invitee = await requireUserByEmail(email);

    if (await isMember(walletId, invitee.id)) {
      return res.status(400).json({ error: "User is already a member of this wallet" });
    }

    const member = await addMember(walletId, invitee.id, role ?? "member");

    return res.status(201).json({ member });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body", details: err.errors });
    }

    if (err.message === "User not found") {
      return res.status(404).json({ error: err.message });
    }

    console.error("Error inviting member:", err);
    return res.status(400).json({ error: err.message ?? "Failed to invite member" });
  }
});

router.post("/:id/join", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.userId as string;

    const walletId = req.params.id ?? "";
    if (!walletId) {
      return res.status(400).json({ error: "Wallet id is required" });
    }
    const wallet = await getWalletById(walletId);
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (await isMember(walletId, userId)) {
      return res.status(400).json({ error: "Already a member of this wallet" });
    }

    const member = await addMember(walletId, userId, "member");

    return res.status(201).json({ member });
  } catch (err: any) {
    console.error("Error joining wallet:", err);
    return res.status(400).json({ error: err.message ?? "Failed to join wallet" });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.userId as string;

    const walletId = req.params.id ?? "";
    if (!walletId) {
      return res.status(400).json({ error: "Wallet id is required" });
    }
    const wallet = await getWalletDetails(walletId);

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const isAdmin = await isWalletAdmin(walletId, userId);
    const member = await isMember(walletId, userId);

    if (!isAdmin && !member) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json({ wallet });
  } catch (err: any) {
    console.error("Error fetching wallet:", err);
    return res.status(400).json({ error: err.message ?? "Failed to fetch wallet" });
  }
});

export { router as walletRouter };
