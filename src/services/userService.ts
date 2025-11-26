import { prisma } from "../core/db.js";
import type { User } from "../generated/prisma/client.js";

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
