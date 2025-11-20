import express from "express";
import { prisma } from "../../core/db.js";
import { authMiddleware } from "../../core/authMiddleware.js";

const router = express.Router();

/**
 * GET /me
 * - Requires Authorization: Bearer <token>
 * - Uses req.userId set by authMiddleware
 * - Returns { id, email } of the current user
 */
router.get("/me", authMiddleware, async (req, res) => {
  const userId = req.userId;

  // This should never happen if authMiddleware works, but just in case
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
