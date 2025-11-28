import express from "express";

import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";

const router = express.Router();

/**
 * GET /user/me
 * Returns the current authenticated user's id and email.
 */
router.get("/me", authMiddleware, async (req, res) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(user);
});

export { router as userRouter };
