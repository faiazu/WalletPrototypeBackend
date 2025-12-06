import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { randomUUID } from "crypto";

// Set required env for JWT signing used by controllers
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

/**
 * In-memory mock of Prisma used by the auth controller.
 * We mock the module before importing the controller/routes.
 */
const users: any[] = [];
const verifications: Record<string, any> = {};

vi.mock("../../core/db.js", () => {
  return {
    prisma: {
      user: {
        async findUnique({ where, include }: any) {
          const u = users.find((usr) => {
            if (where?.email) return usr.email === where.email;
            if (where?.id) return usr.id === where.id;
            return false;
          });
          if (!u) return null;
          if (include?.verification) {
            return { ...u, verification: verifications[u.id] ?? null };
          }
          return u;
        },
        async create({ data }: any) {
          const record = {
            id: data.id ?? randomUUID(),
            email: data.email,
            fullName: data.fullName,
            phone: data.phone ?? null,
            passwordHash: data.passwordHash,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.push(record);
          if (data.verification?.create) {
            verifications[record.id] = {
              userId: record.id,
              emailVerified: data.verification.create.emailVerified ?? false,
              phoneVerified: data.verification.create.phoneVerified ?? false,
              kycStatus: data.verification.create.kycStatus ?? "unverified",
            };
          }
          return record;
        },
      },
      userVerification: {
        async create({ data }: any) {
          verifications[data.userId] = {
            userId: data.userId,
            emailVerified: data.emailVerified ?? false,
            phoneVerified: data.phoneVerified ?? false,
            kycStatus: data.kycStatus ?? "unverified",
          };
          return verifications[data.userId];
        },
        async update({ where, data }: any) {
          const existing = verifications[where.userId];
          verifications[where.userId] = {
            ...existing,
            ...data,
          };
          return verifications[where.userId];
        },
      },
    },
  };
});

vi.mock("bcryptjs", () => {
  return {
    default: {
      hash: async (value: string) => `hashed:${value}`,
      compare: async (value: string, hash: string) => hash === `hashed:${value}`,
    },
    hash: async (value: string) => `hashed:${value}`,
    compare: async (value: string, hash: string) => hash === `hashed:${value}`,
  };
});

import { authRoutes } from "./routes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  return app;
}

describe("Auth routes", () => {
  beforeEach(() => {
    users.length = 0;
    Object.keys(verifications).forEach((k) => delete verifications[k]);
  });

  it("registers and logs in a user with password", async () => {
    const app = makeApp();

    const registerRes = await request(app)
      .post("/auth/register")
      .send({ email: "user@example.com", password: "Password1!", fullName: "Test User" })
      .expect(201);

    expect(registerRes.body.user.email).toBe("user@example.com");
    expect(registerRes.body.token).toBeTruthy();

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "Password1!" })
      .expect(200);

    expect(loginRes.body.user.email).toBe("user@example.com");
    expect(loginRes.body.token).toBeTruthy();
  });

  it("rejects login with wrong password", async () => {
    const app = makeApp();

    await request(app)
      .post("/auth/register")
      .send({ email: "user@example.com", password: "Password1!", fullName: "Test User" })
      .expect(201);

    await request(app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "wrong" })
      .expect(401);
  });

  it("login-christopher creates the demo user if missing and returns token", async () => {
    const app = makeApp();

    const res = await request(app).post("/auth/login-christopher").expect(200);

    expect(res.body.demo).toBe(true);
    expect(res.body.user.email).toBe(process.env.DEMO_LOGIN_EMAIL || "christopher.albertson@example.com");
    expect(res.body.token).toBeTruthy();

    // Calling again should reuse the same user, not create duplicates
    const res2 = await request(app).post("/auth/login-christopher").expect(200);
    expect(res2.body.user.email).toBe(res.body.user.email);
  });
});

