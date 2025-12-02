import { Router, type Request, type Response } from "express";
import { prisma } from "../../../../core/db.js";

const router = Router();

/**
 * GET /test/state
 * 
 * Get current system state for debugging and testing
 * Returns counts of key entities
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const [
      userCount,
      walletCount,
      cardCount,
      ledgerAccountCount,
      ledgerEntryCount,
      withdrawalCount,
      eventCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.wallet.count(),
      prisma.baasCard.count(),
      prisma.ledgerAccount.count(),
      prisma.ledgerEntry.count(),
      prisma.withdrawalRequest.count(),
      prisma.baasEvent.count(),
    ]);

    return res.json({
      counts: {
        users: userCount,
        wallets: walletCount,
        cards: cardCount,
        ledgerAccounts: ledgerAccountCount,
        ledgerEntries: ledgerEntryCount,
        withdrawals: withdrawalCount,
        events: eventCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "Failed to fetch state",
      message: err.message || "Unknown error",
    });
  }
});

export { router as mockStateRoutes };

