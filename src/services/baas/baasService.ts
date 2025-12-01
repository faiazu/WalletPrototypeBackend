// baas service implementation would go here
// orchestrate calls to provider

import {
    PrismaClient,
    BaasProviderName,
    type BaasAccount,
} from "../../generated/prisma/client.js";

import type {
  CreateCustomerParams,
  CreateCustomerResult,
  CreateCardParams,
  CreateCardResult,
  CreateAccountResult,
} from "./baasClient.js";

import type {
  BaasClient,
} from "./baasClient.js";
import { supportsAccountCreation } from "./baasClient.js";
import { buildEmbossName } from "./synctera/embossNameHelper.js";

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
    baasCustomerId: string;
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
        baasCustomerId: existing.id,
      };
    }

    const params: CreateCustomerParams = {
      userId: user.id,
      email: user.email ?? undefined,
      legalName: user.name ?? "",
    };

    const created: CreateCustomerResult = await this.client.createCustomer(params);

    const createdRow = await this.prisma.baasCustomer.create({
      data: {
        userId: user.id,
        providerName: created.provider,
        externalCustomerId: created.externalCustomerId,
      },
    });

    return {
      provider: created.provider,
      externalCustomerId: created.externalCustomerId,
      baasCustomerId: createdRow.id,
    };
  }

  /**
   * Ensure there is a BaasAccount for this user/provider.
   * Optionally binds it to a wallet (for routing deposits and card issuance).
   */
  async ensureAccountForUser(
    userId: string,
    walletId?: string
  ): Promise<BaasAccount> {
    if (!supportsAccountCreation(this.client)) {
      throw new Error("AccountCreationNotSupported");
    }

    const existing = await this.prisma.baasAccount.findFirst({
      where: {
        userId,
        providerName: this.provider,
      },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      if (walletId && !existing.walletId) {
        return this.prisma.baasAccount.update({
          where: { id: existing.id },
          data: { walletId },
        });
      }
      return existing;
    }

    const { provider, externalCustomerId, baasCustomerId } =
      await this.ensureCustomerForUser(userId);

    const accountResult: CreateAccountResult = await this.client.createAccount({
      externalCustomerId,
    });

    const account = await this.prisma.baasAccount.create({
      data: {
        userId,
        walletId: walletId ?? null,
        baasCustomerId,
        providerName: provider,
        externalAccountId: accountResult.externalAccountId,
        accountType: accountResult.accountType ?? "CHECKING",
        currency: accountResult.currency ?? "USD",
        status: accountResult.status ?? "PENDING",
        accessStatus: accountResult.accessStatus ?? null,
        accountNumberLast4: accountResult.accountNumberLast4 ?? null,
        routingNumber: accountResult.routingNumber ?? null,
        metadata: accountResult.rawResponse ?? null,
      },
    });

    if (walletId) {
      const fundingReference = "";
      await this.prisma.baasFundingRoute.upsert({
        where: {
          providerName_providerAccountId_reference: {
            providerName: provider,
            providerAccountId: accountResult.externalAccountId,
            reference: fundingReference,
          },
        },
        update: {
          walletId,
          userId,
          baasAccountId: account.id,
        },
        create: {
          providerName: provider,
          providerAccountId: accountResult.externalAccountId,
          reference: fundingReference,
          walletId,
          userId,
          baasAccountId: account.id,
        },
      });
    }

    return account;
  }

  /**
   * Create a card for a user and tie it to a specific wallet.
   *
   * This is crucial for your cardProgramService:
   *  - card.userId  = the payer
   *  - card.walletId = which shared wallet balance to hit
   */
  async createCardForUser(
    userId: string,
    walletId: string,
    options?: { nickname?: string }
  ): Promise<{
    provider: BaasProviderName;
    externalCardId: string;
    last4?: string;
    status?: string;
    nickname?: string | null;
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

    // Fetch user details for embossing and context
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    // 2) Ensure a BaaS customer exists for this user
    const { provider, externalCustomerId, baasCustomerId } =
      await this.ensureCustomerForUser(userId);

    // 3) Ensure a provider account exists (and bind to wallet if provided)
    const account = await this.ensureAccountForUser(userId, walletId);

    // 4) Ask provider to create a card
    const cardResult: CreateCardResult = await this.client.createCard({
      userId,
      externalCustomerId,
      externalAccountId: account.externalAccountId,
      embossName: buildEmbossName(user?.name, user?.email),
      // later you can add params like spending limits here
    } as CreateCardParams);

    // If a card already exists for this wallet/user/provider with same external id, return it.
    const existingCard = await this.prisma.baasCard.findFirst({
      where: {
        userId,
        walletId,
        providerName: this.provider,
        externalCardId: cardResult.externalCardId,
      },
    });

    if (existingCard) {
      return {
        provider: existingCard.providerName,
        externalCardId: existingCard.externalCardId,
        ...(existingCard.last4 && { last4: existingCard.last4 }),
        ...(existingCard.status && { status: existingCard.status }),
        nickname: existingCard.nickname ?? null,
      };
    }

    // 5) Persist mapping in BaasCard, including walletId
    await this.prisma.baasCard.create({
      data: {
        userId,
        walletId,
        baasCustomerId,
        baasAccountId: account.id,
        providerName: cardResult.provider,
        externalCardId: cardResult.externalCardId,
        last4: cardResult.last4 ?? null,
        status: cardResult.status ?? "ACTIVE",
        nickname: options?.nickname ?? null,
      },
    });

    return {
      provider: cardResult.provider,
      externalCardId: cardResult.externalCardId,
      ...(cardResult.last4 && { last4: cardResult.last4 }),
      status: cardResult.status ?? "ACTIVE",
      nickname: options?.nickname ?? null,
    };
  }

  /**
   * Update card status at the provider and persist locally.
   */
  async updateCardStatus(externalCardId: string, status: string): Promise<void> {
    if (typeof (this.client as any)?.updateCardStatus === "function") {
      await (this.client as any).updateCardStatus(externalCardId, status);
    }

    await this.prisma.baasCard.updateMany({
      where: { externalCardId, providerName: this.provider },
      data: { status, updatedAt: new Date() },
    });
  }
}
