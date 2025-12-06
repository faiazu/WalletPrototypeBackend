import { Router } from "express";
import {
  addMemberHandler,
  createWalletHandler,
  getWalletHandler,
  listWalletsHandler,
} from "./controller.js";

const router = Router();

router.post("/", createWalletHandler);
router.get("/", listWalletsHandler);
router.get("/:walletId", getWalletHandler);
router.post("/:walletId/members", addMemberHandler);

export { router as walletRoutes };

