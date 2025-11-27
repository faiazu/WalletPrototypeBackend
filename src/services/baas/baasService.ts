// baas service implementation would go here
// orchestrate calls to provider

import {
    PrismaClient,
    BaasProviderName
} from "../../generated/prisma/client.js";

import type {
    BaasCustomer,
    BaasCard
} from "../../generated/prisma/client.js";

import type {
  BaasClient,
  CreateCustomerResult,
  CreateCardResult,
} from "./baasClient.js";

/**
 * BaasService:
 *  - Knows about Divvi's database (Prisma) and user ids
 *  - Uses a BaasClient to talk to the external BaaS provider
 *  - Persists mappings (user -> externalCustomerId, user -> externalCardId).
 *
 * This service does NOT know about ledger or card authorizations.
 * It just handles onboarding users to the BaaS and creating cards.
 */
export class BaasService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly client: BaasClient,
    private readonly providerName: BaasProviderName = BaasProviderName.MOCK
  ) {}

  /**
   * Find existing BaaS customer mapping in the DB.
   */
  private async findExistingCustomer(userId: string): Promise<BaasCustomer | null> {
    return this.prisma.baasCustomer.findFirst({
      where: {
        userId,
        providerName: this.providerName,
      },
    });
  }

  /**
   * Insert a new BaasCustomer record into the DB.
   */
  private async createCustomerRecord(
    userId: string,
    result: CreateCustomerResult
  ): Promise<BaasCustomer> {
    return this.prisma.baasCustomer.create({
      data: {
        userId,
        providerName: result.provider,
        externalCustomerId: result.externalCustomerId,
      },
    });
  }

  /**
   * Ensure there is a BaaS customer for this Divvi user.
   *
   * - If a mapping already exists in the DB, re-use it.
   * - Otherwise, call the BaaS API via BaasClient to create one,
   *   then persist the mapping in BaasCustomer.
   *
   * Returns the provider name and the externalCustomerId.
   */
  async ensureCustomerForUser(
    userId: string
  ): Promise<{ provider: BaasProviderName; externalCustomerId: string }> {
    // Make sure the user exists in your DB.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new Error(
        `Cannot ensure BaaS customer: user with id ${userId} does not exist`
      );
    }

    // Check if we already have a BaaS customer record for this user.
    const existing = await this.findExistingCustomer(userId);
    if (existing) {
      return {
        provider: existing.providerName,
        externalCustomerId: existing.externalCustomerId,
      };
    }

    // Otherwise, create a new customer via the BaaS client.
    const created: CreateCustomerResult = await this.client.createCustomer({
      userId: user.id,
      email: user.email,
      ...(user.name && { legalName: user.name }),
    });

    // Persist the mapping in the DB.
    await this.createCustomerRecord(userId, created);

    return {
      provider: created.provider,
      externalCustomerId: created.externalCustomerId,
    };
  }

  /**
   * Insert a new BaasCard record into the DB.
   */
  private async createCardRecord(
    userId: string,
    result: CreateCardResult
  ): Promise<BaasCard> {
    return this.prisma.baasCard.create({
      data: {
        userId,
        providerName: result.provider,
        externalCardId: result.externalCardId,
        last4: result.last4 ?? null,
      },
    });
  }

  /**
   * Create a card for the given user at the BaaS, and store it in the DB.
   *
   * - Ensures the user has a BaaS customer first.
   * - Calls the BaaS client to create a card.
   * - Persists the BaasCard mapping.
   *
   * Returns basic info about the created card.
   */
  async createCardForUser(userId: string): Promise<{
    provider: BaasProviderName;
    externalCardId: string;
    last4: string | null;
  }> {
    // Ensure we have a customer at the BaaS for this user.
    const { provider, externalCustomerId } =
      await this.ensureCustomerForUser(userId);

    // Create the card via provider API (or mock).
    const created: CreateCardResult = await this.client.createCard({
      userId,
      externalCustomerId,
    });

    // Persist in the DB.
    await this.createCardRecord(userId, created);

    return {
      provider,
      externalCardId: created.externalCardId,
      last4: created.last4 ?? null,
    };
  }
}
