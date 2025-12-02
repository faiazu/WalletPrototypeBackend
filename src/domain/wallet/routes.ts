import { Router } from "express";

import {
  createWallet,
  inviteMember,
  joinWallet,
  listMyWallets,
  getWalletDetails,
  createFundingRoute,
  listFundingRoutes,
} from "./controller.js";

const router = Router();

router.get("/", listMyWallets);
router.post("/create", createWallet);
router.post("/:id/invite", inviteMember);
router.post("/:id/join", joinWallet);
router.get("/:id", getWalletDetails);

// Funding routes (admin only for POST)
router.post("/:id/funding-routes", createFundingRoute);
router.get("/:id/funding-routes", listFundingRoutes);

export { router as walletRoutes };
