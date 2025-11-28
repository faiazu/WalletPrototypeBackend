import { signAccessToken } from "../../core/jwt.js";

export function issueTokenForUser(userId: string): string {
  // payload shape must match what authMiddleware expects
  return signAccessToken(userId);
}
