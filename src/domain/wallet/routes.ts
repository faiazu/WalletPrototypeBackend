import { Router } from "express";

import {
  createWallet,
  inviteMember,
  joinWallet,
  listMyWallets,
  getWalletDetails,
} from "./controller.js";

const router = Router();

router.get("/", listMyWallets);
router.post("/create", createWallet);
router.post("/:id/invite", inviteMember);
router.post("/:id/join", joinWallet);
router.get("/:id", getWalletDetails);

export { router as walletRoutes };
