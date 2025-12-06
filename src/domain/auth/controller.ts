import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../core/db.js";
import { signAccessToken } from "../../core/jwt.js";
import { registerSchema, loginSchema } from "./validator.js";

function toPublicUser<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, phone } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "EmailAlreadyExists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        phone: phone ?? null,
        passwordHash,
        verification: {
          create: {},
        },
      },
    });

    const token = signAccessToken(user.id);
    return res.status(201).json({ user: toPublicUser(user), token });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "InvalidRequest", details: err.errors });
    }
    return res.status(400).json({ error: err?.message ?? "Registration failed" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: "InvalidCredentials" });
    }

    const valid = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!valid) {
      return res.status(401).json({ error: "InvalidCredentials" });
    }

    const token = signAccessToken(user.id);
    return res.json({ user: toPublicUser(user), token });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "InvalidRequest", details: err.errors });
    }
    return res.status(400).json({ error: err?.message ?? "Login failed" });
  }
};

const DEMO_EMAIL = process.env.DEMO_LOGIN_EMAIL || "christopher.albertson@example.com";
const DEMO_NAME = process.env.DEMO_LOGIN_NAME || "Christopher Albertson";
const DEMO_PHONE = process.env.DEMO_LOGIN_PHONE || "+16045551212";
const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "DemoPass123!";

async function ensureDemoUser() {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { verification: true },
  });

  if (existing) {
    if (!existing.verification) {
      await prisma.userVerification.create({
        data: {
          userId: existing.id,
          emailVerified: true,
          phoneVerified: true,
          kycStatus: "accepted",
        },
      });
    } else if (existing.verification.kycStatus !== "accepted") {
      await prisma.userVerification.update({
        where: { userId: existing.id },
        data: {
          emailVerified: true,
          phoneVerified: true,
          kycStatus: "accepted",
        },
      });
    }
    return existing;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      fullName: DEMO_NAME,
      phone: DEMO_PHONE,
      passwordHash,
      verification: {
        create: {
          emailVerified: true,
          phoneVerified: true,
          kycStatus: "accepted",
        },
      },
    },
  });
}

export const loginChristopher = async (_req: Request, res: Response) => {
  try {
    const user = await ensureDemoUser();
    const token = signAccessToken(user.id);
    return res.json({
      user: toPublicUser(user),
      token,
      demo: true,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Login failed" });
  }
};

