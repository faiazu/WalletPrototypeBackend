import jwt from "jsonwebtoken";
const { sign, verify } = jwt;
import "dotenv/config";

if (!process.env.JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in environment");
}

const JWT_SECRET: string = process.env.JWT_SECRET;

type AccessTokenPayload = {
  sub: string; // userId
  iat: number; // issued at time
  exp: number; // expiration time
};

export function signAccessToken(userId: string): string {
  return sign(
    { sub: userId },
    JWT_SECRET,
    { expiresIn: "7d" } // 7-day access token for now
  );
}

export function verifyAccessToken(token: string): { sub: string; iat: number; exp: number } {
  const payload = verify(token, JWT_SECRET);
  // jsonwebtoken.verify can return string | JwtPayload, so cast the type
  return payload as AccessTokenPayload;
}
