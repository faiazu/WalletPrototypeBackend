import { Router } from "express";

import {
  createWallet,
  inviteMember,
  joinWallet,
  listMyWallets,
  getWalletDetails,
  createFundingRoute,
  listFundingRoutes,
  updateSpendPolicy,
} from "./controller.js";

import {
  createWithdrawal,
  listWithdrawals,
  getWithdrawal,
} from "./withdrawalController.js";

const router = Router();

router.get("/", listMyWallets);
router.post("/create", createWallet);
router.post("/:id/invite", inviteMember);
router.post("/:id/join", joinWallet);
router.get("/:id", getWalletDetails);

// Funding routes (admin only for POST)
router.post("/:id/funding-routes", createFundingRoute);
router.get("/:id/funding-routes", listFundingRoutes);

// Spend policy management (admin only)
router.patch("/:id/spend-policy", updateSpendPolicy);

// Withdrawals (member access)
router.post("/:id/withdrawals", createWithdrawal);
router.get("/:id/withdrawals", listWithdrawals);
router.get("/:id/withdrawals/:withdrawalId", getWithdrawal);

export { router as walletRoutes };
