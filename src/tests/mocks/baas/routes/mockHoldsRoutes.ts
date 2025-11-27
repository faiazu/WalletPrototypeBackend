import express from "express";
import { z } from "zod";

import { prisma } from "../../../../core/db.js";
import { BaasProviderName } from "../../../../generated/prisma/enums.js";

const router = express.Router();

const paramsSchema = z.object({
  walletId: z.string().min(1),
});

// GET /test/baas/holds/:walletId
// Returns all holds for the wallet (mock provider only) for debugging.
router.get("/:walletId", async (req, res) => {
  try {
    const { walletId } = paramsSchema.parse(req.params);

    const holds = await prisma.cardAuthHold.findMany({
      where: { walletId, providerName: BaasProviderName.MOCK },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ holds });
  } catch (err: any) {
    console.error("mock holds error:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid walletId" });
    }
    return res.status(500).json({ error: "Failed to fetch holds" });
  }
});

export { router as mockHoldsRoutes };
