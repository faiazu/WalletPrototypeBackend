import { Router, type Request, type Response } from "express";
import { prisma } from "../../../../core/db.js";

const router = Router();

/**
 * POST /test/baas/reset
 * 
 * Reset database state for testing
 * DANGEROUS: Deletes all data except system accounts
 * 
 * Only available in non-production environments
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    // Extra safety check
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Reset endpoint not available in production",
      });
    }

    console.log("[MockReset] Starting database reset...");

    // Delete in order to respect foreign key constraints
    await prisma.$transaction(async (tx) => {
      // Delete webhook events
      await tx.baasEvent.deleteMany({});

      // Delete withdrawal transfers and requests
      await tx.withdrawalTransfer.deleteMany({});
      await tx.withdrawalRequest.deleteMany({});

      // Delete auth holds
      await tx.cardAuthHold.deleteMany({});

      // Delete funding routes
      await tx.baasFundingRoute.deleteMany({});

      // Delete cards
      await tx.baasCard.deleteMany({});

      // Delete accounts
      await tx.baasAccount.deleteMany({});

      // Delete customers
      await tx.baasCustomer.deleteMany({});

      // Delete ledger entries and accounts
      await tx.ledgerEntry.deleteMany({});
      await tx.ledgerAccount.deleteMany({});

      // Delete wallet members and wallets
      await tx.walletMember.deleteMany({});
      await tx.walletBalance.deleteMany({});
      await tx.wallet.deleteMany({});

      // Delete cards (old schema if exists)
      await tx.card.deleteMany({});

      // Note: We keep Users to preserve test accounts
    });

    console.log("[MockReset] Database reset complete");

    return res.status(200).json({
      message: "Database reset successful",
      deleted: {
        events: "all",
        withdrawals: "all",
        cards: "all",
        accounts: "all",
        wallets: "all",
        ledger: "all",
        note: "User accounts preserved",
      },
    });
  } catch (err: any) {
    console.error("[MockReset] Reset failed:", err);

    return res.status(500).json({
      error: "Reset failed",
      message: err.message || "Unknown error",
    });
  }
});

export { router as mockResetRoutes };

