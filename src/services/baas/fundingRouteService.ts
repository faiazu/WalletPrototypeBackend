import { prisma } from "../../core/db.js";
import type { BaasFundingRoute, BaasProviderName } from "../../generated/prisma/client.js";

/**
 * Service for managing BaasFundingRoute records.
 * Routes WALLET_FUNDING webhook events to the correct wallet/user.
 */

export const fundingRouteService = {
  /**
   * Upsert a funding route mapping.
   * Creates or updates a route based on (providerName, providerAccountId, reference).
   */
  async upsertRoute({
    providerName,
    providerAccountId,
    reference,
    walletId,
    userId,
    baasAccountId,
  }: {
    providerName: BaasProviderName;
    providerAccountId: string;
    reference?: string | null;
    walletId: string;
    userId: string;
    baasAccountId?: string | null;
  }): Promise<BaasFundingRoute> {
    // Normalize reference to empty string if null/undefined for unique constraint
    const normalizedReference = reference || "";

    return prisma.baasFundingRoute.upsert({
      where: {
        providerName_providerAccountId_reference: {
          providerName,
          providerAccountId,
          reference: normalizedReference,
        },
      },
      update: {
        walletId,
        userId,
        ...(baasAccountId !== undefined && { baasAccountId }),
      },
      create: {
        providerName,
        providerAccountId,
        reference: normalizedReference,
        walletId,
        userId,
        ...(baasAccountId !== undefined && { baasAccountId }),
      },
    });
  },

  /**
   * Find a funding route by composite key.
   */
  async findRoute({
    providerName,
    providerAccountId,
    reference,
  }: {
    providerName: BaasProviderName;
    providerAccountId: string;
    reference?: string | null;
  }): Promise<BaasFundingRoute | null> {
    const normalizedReference = reference || "";

    return prisma.baasFundingRoute.findUnique({
      where: {
        providerName_providerAccountId_reference: {
          providerName,
          providerAccountId,
          reference: normalizedReference,
        },
      },
      include: {
        wallet: true,
        user: true,
        baasAccount: true,
      },
    });
  },

  /**
   * List all funding routes for a specific wallet.
   */
  async listByWallet(walletId: string): Promise<BaasFundingRoute[]> {
    return prisma.baasFundingRoute.findMany({
      where: { walletId },
      include: {
        user: true,
        baasAccount: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * List all funding routes for a specific user.
   */
  async listByUser(userId: string): Promise<BaasFundingRoute[]> {
    return prisma.baasFundingRoute.findMany({
      where: { userId },
      include: {
        wallet: true,
        baasAccount: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Delete a funding route by composite key.
   */
  async deleteRoute({
    providerName,
    providerAccountId,
    reference,
  }: {
    providerName: BaasProviderName;
    providerAccountId: string;
    reference?: string | null;
  }): Promise<BaasFundingRoute> {
    const normalizedReference = reference || "";

    return prisma.baasFundingRoute.delete({
      where: {
        providerName_providerAccountId_reference: {
          providerName,
          providerAccountId,
          reference: normalizedReference,
        },
      },
    });
  },

  /**
   * Delete all funding routes for a wallet.
   */
  async deleteByWallet(walletId: string): Promise<{ count: number }> {
    return prisma.baasFundingRoute.deleteMany({
      where: { walletId },
    });
  },

  /**
   * Check if a funding route exists.
   */
  async exists({
    providerName,
    providerAccountId,
    reference,
  }: {
    providerName: BaasProviderName;
    providerAccountId: string;
    reference?: string | null;
  }): Promise<boolean> {
    const route = await this.findRoute({ providerName, providerAccountId, reference: reference ?? null });
    return route !== null;
  },
};

