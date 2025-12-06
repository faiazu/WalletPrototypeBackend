import { Router } from "express";
import { authMiddleware } from "../../core/authMiddleware.js";
import { prisma } from "../../core/db.js";

const router = Router();

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
      phone: true,
      fullName: true,
      createdAt: true,
      updatedAt: true,
      verification: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "UserNotFound" });
  }

  return res.json(user);
});

export { router as userRoutes };

