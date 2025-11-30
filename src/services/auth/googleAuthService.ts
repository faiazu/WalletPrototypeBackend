import { LoginTicket, OAuth2Client } from "google-auth-library";

import { prisma } from "../../core/db.js";
import { signAccessToken } from "../../core/jwt.js";

function getGoogleClient(): { client: OAuth2Client; clientId: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing GOOGLE_CLIENT_ID in environment");
  }
  return { client: new OAuth2Client(clientId), clientId };
}

export async function signInWithGoogle(idToken: string) {
  const { client: googleClient, clientId: GOOGLE_CLIENT_ID } = getGoogleClient();

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
  const fullName: string | undefined = payload.name || undefined;

  // 2. Upsert user in DB
  const user = await prisma.user.upsert({
    where: { googleId: googleSub },
    update: {
      email: email,
      ...(fullName ? { name: fullName } : {}),
    },
    create: {
      googleId: googleSub,
      email: email,
      name: fullName ?? null,
    },
  });

  // 3. Issue your app's JWT
  const token: string = signAccessToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name || fullName || null,
    },
    token,
  };
}
