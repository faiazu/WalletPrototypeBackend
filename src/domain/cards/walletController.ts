import type { Request, Response } from "express";

import { prisma } from "../../core/db.js";
import { isMember } from "../wallet/memberService.js";

export const listWalletCards = async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const walletId = req.params.walletId!;

    // Ensure requester is a wallet member
    if (!(await isMember(walletId, userId))) {
      return res.status(403).json({ error: "Not a wallet member" });
    }

    const cards = await prisma.baasCard.findMany({
      where: { walletId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    return res.json({ cards });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to list cards" });
  }
};
