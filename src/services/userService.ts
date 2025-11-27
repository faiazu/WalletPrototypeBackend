import { prisma } from "../core/db.js";
import type { User } from "../generated/prisma/client.js";
import {
  deactivateSyncteraPersonForUser,
  linkUserToSynctera,
} from "./baas/synctera/userSyncteraService.js";

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function requireUserByEmail(email: string): Promise<User> {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

// Ensures a user exists with the given email; creates one if not found
export async function ensureUserByEmail(email: string, name?: string): Promise<User> {
  let user: User | null = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email,
        name: name ?? null,
      },
    });

    // Synctera PERSON creation -> store in BaasCustomer
    await linkUserToSynctera(user);
  }

  return user;
}

// List all users (for testing purposes)
export async function listUsers() {
  return prisma.user.findMany();
}

// Soft-deactivate user and mark Synctera person inactive (best-effort)
export async function deactivateUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      kycStatus: "INACTIVE",
    },
  });

  await deactivateSyncteraPersonForUser(userId);

  return updated;
}
