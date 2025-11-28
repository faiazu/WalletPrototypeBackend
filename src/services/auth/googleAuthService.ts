import { LoginTicket, OAuth2Client } from "google-auth-library";

import { prisma } from "../../core/db.js";
import { signAccessToken } from "../../core/jwt.js";

if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error("Missing GOOGLE_CLIENT_ID in environment");
}

const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID;
const googleClient: OAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function signInWithGoogle(idToken: string) {
  // 1. Verify token with Google
  const ticket: LoginTicket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Invalid Google ID token");
  }

  console.log("Google ID token payload aud:", payload.aud);
  console.log("ENV GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID);

  const googleSub: string = payload.sub;
  const email: string = payload.email;

  // 2. Upsert user in DB
  const user = await prisma.user.upsert({
    where: { googleId: googleSub },
    update: { email: email },
    create: {
      googleId: googleSub,
      email: email,
    },
  });

  // 3. Issue your app's JWT
  const token: string = signAccessToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token,
  };
}
