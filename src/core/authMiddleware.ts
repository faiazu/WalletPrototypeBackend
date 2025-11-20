import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./jwt.js";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // 1. Read the Authorization header
  const authHeader = req.headers.authorization;

  // 2. Check that it's present and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  // 3. Extract the actual token ("Bearer <token>" → "<token>")
  const token = authHeader.substring("Bearer ".length).trim();

  try {
    // 4. Verify the token using your existing helper
    const payload = verifyAccessToken(token);
    // payload should look like: { sub: "userId", iat: ..., exp: ... }

    if (!payload || !payload.sub) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // 5. Attach the userId to the request
    req.userId = String(payload.sub);

    // 6. Allow request to continue to the next handler / route
    return next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
