import { prisma } from "../../core/db.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { WalletSpendPolicy } from "../../generated/prisma/enums.js";

/**
 * SplittingPolicyService
 * 
 * Determines how card transaction amounts should be split across wallet members.
 * Supports policies:
 * - PAYER_ONLY: Full amount charged to cardholder
 * - EQUAL_SPLIT: Amount divided equally among all wallet members
 * 
 * Includes in-memory LRU cache to avoid repeated DB lookups for wallet policies.
 */
export class SplittingPolicyService {
  private prisma: PrismaClient;
  private cache: Map<string, { policy: WalletSpendPolicy; timestamp: number }>;
  private readonly cacheMaxSize: number = 1000;
  private readonly cacheTtlMs: number = 60000; // 60 seconds

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.cache = new Map();
  }

  /**
   * Get the spend policy for a wallet with caching
   */
  async getWalletPolicy(walletId: string): Promise<WalletSpendPolicy> {
    const cached = this.cache.get(walletId);
    const now = Date.now();

    // Return cached value if still valid
    if (cached && now - cached.timestamp < this.cacheTtlMs) {
      return cached.policy;
    }

    // Fetch from DB
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { spendPolicy: true },
    });

    if (!wallet) {
      throw new Error(`Wallet ${walletId} not found`);
    }

    // Update cache (implement simple LRU eviction)
    if (this.cache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(walletId, {
      policy: wallet.spendPolicy,
      timestamp: now,
    });

    return wallet.spendPolicy;
  }

  /**
   * Invalidate cache entry for a wallet (call this when policy is updated)
   */
  invalidateCache(walletId: string): void {
    this.cache.delete(walletId);
  }

  /**
   * Clear entire cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Calculate split shares for a transaction based on wallet policy
   * 
   * @param walletId - Wallet ID
   * @param cardholderUserId - User who owns the card
   * @param amountMinor - Transaction amount in minor units (cents)
   * @returns Array of { userId, amountMinor } splits
   */
  async calculateSplits(
    walletId: string,
    cardholderUserId: string,
    amountMinor: number
  ): Promise<Array<{ userId: string; amountMinor: number }>> {
    const policy = await this.getWalletPolicy(walletId);

    switch (policy) {
      case WalletSpendPolicy.PAYER_ONLY:
        return [{ userId: cardholderUserId, amountMinor }];

      case WalletSpendPolicy.EQUAL_SPLIT:
        return this.calculateEqualSplit(walletId, amountMinor);

      default:
        // Fallback to PAYER_ONLY for unknown policies
        console.warn(`Unknown spend policy: ${policy}, defaulting to PAYER_ONLY`);
        return [{ userId: cardholderUserId, amountMinor }];
    }
  }

  /**
   * Calculate equal split among all wallet members
   */
  private async calculateEqualSplit(
    walletId: string,
    amountMinor: number
  ): Promise<Array<{ userId: string; amountMinor: number }>> {
    // Fetch all wallet members
    const members = await this.prisma.walletMember.findMany({
      where: { walletId },
      select: { userId: true },
    });

    if (members.length === 0) {
      throw new Error(`Wallet ${walletId} has no members`);
    }

    // Calculate base amount per member
    const baseAmount = Math.floor(amountMinor / members.length);
    
    // Calculate remainder to distribute
    const remainder = amountMinor - (baseAmount * members.length);

    // Build splits array
    const splits = members.map((member, index) => ({
      userId: member.userId,
      // First 'remainder' members get baseAmount + 1, rest get baseAmount
      amountMinor: baseAmount + (index < remainder ? 1 : 0),
    }));

    return splits;
  }
}

// Singleton instance
export const splittingPolicyService = new SplittingPolicyService(prisma);

