// GET /test/auth/users
import express from "express";

import { listUsers } from "../../../../services/userService.js";

const router = express.Router();

// GET /test/auth/users
router.get("/users", async (req, res) => {
  try {
    const users = await listUsers();
    return res.json({ users });
  } 
  catch (err: any) {
    console.error("mock users list error:", err);
    return res.status(500).json({ error: "Failed to list users" });
  }
});

export { router as mockListUsersRoutes };