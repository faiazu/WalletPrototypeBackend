// baas service implementation would go here
// orchestrate calls to provider

import {
    PrismaClient,
    BaasProviderName
} from "../../generated/prisma/client.js";

import type {
  CreateCustomerParams,
  CreateCustomerResult,
  CreateCardParams,
  CreateCardResult
} from "./baasClient.js";

import type {
  BaasClient,
} from "./baasClient.js";

export class BaasService {
  private prisma: PrismaClient;
  private client: BaasClient;
  private provider: BaasProviderName;

  constructor(
    prisma: PrismaClient,
    client: BaasClient,
    provider: BaasProviderName
  ) {
    this.prisma = prisma;
    this.client = client;
    this.provider = provider;
  }

  /**
   * Ensure there is a BaasCustomer row for this user + provider.
   * Creates one via the BaaS client if needed.
   */
  async ensureCustomerForUser(userId: string): Promise<{
    provider: BaasProviderName;
    externalCustomerId: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new Error("UserNotFound");
    }

    const existing = await this.prisma.baasCustomer.findFirst({
      where: {
        userId: user.id,
        providerName: this.provider,
      },
    });

    if (existing) {
      return {
        provider: existing.providerName,
        externalCustomerId: existing.externalCustomerId,
      };
    }

    const params: CreateCustomerParams = {
      userId: user.id,
      email: user.email ?? undefined,
      legalName: user.name ?? "",
    };

    const created: CreateCustomerResult = await this.client.createCustomer(params);

    await this.prisma.baasCustomer.create({
      data: {
        userId: user.id,
        providerName: created.provider,
        externalCustomerId: created.externalCustomerId,
      },
    });

    return {
      provider: created.provider,
      externalCustomerId: created.externalCustomerId,
    };
  }

  /**
   * Create a card for a user and tie it to a specific wallet.
   *
   * This is crucial for your cardProgramService:
   *  - card.userId  = the payer
   *  - card.walletId = which shared wallet balance to hit
   */
  async createCardForUser(userId: string, walletId: string): Promise<{
    provider: BaasProviderName;
    externalCardId: string;
    last4?: string;
  }> {
    // 1) Ensure user exists + belongs to this wallet
    const walletMember = await this.prisma.walletMember.findFirst({
      where: {
        walletId,
        userId,
      },
      select: { id: true },
    });

    if (!walletMember) {
      throw new Error("UserNotMemberOfWallet");
    }

    // 2) Ensure a BaaS customer exists for this user
    const { provider, externalCustomerId } = await this.ensureCustomerForUser(
      userId
    );

    // 3) Ask provider to create a card
    const cardResult: CreateCardResult = await this.client.createCard({
      userId,
      externalCustomerId,
      // later you can add params like spending limits here
    } as CreateCardParams);

    // 4) Persist mapping in BaasCard, including walletId
    await this.prisma.baasCard.create({
      data: {
        userId,
        walletId,
        providerName: cardResult.provider,
        externalCardId: cardResult.externalCardId,
        last4: cardResult.last4 ?? null,
        status: "ACTIVE",
      },
    });

    return {
      provider: cardResult.provider,
      externalCardId: cardResult.externalCardId,
      ...(cardResult.last4 && { last4: cardResult.last4 }),
    };
  }
}
