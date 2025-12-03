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
  InitiatePayoutParams,
  InitiatePayoutResult,
} from "./baasClient.js";

import type {
  BaasClient,
} from "./baasClient.js";
import { supportsAccountCreation, supportsPayouts } from "./baasClient.js";
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
   * @param reference - Optional reference label for funding route (e.g., simulation context)
   */
  async ensureAccountForUser(
    userId: string,
    walletId?: string,
    reference?: string
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
      // BaasAccount no longer has walletId in the schema (card-centric)
      return existing;
    }

    const { provider, externalCustomerId, baasCustomerId } =
      await this.ensureCustomerForUser(userId);

    const accountResult: CreateAccountResult = await this.client.createAccount({
      externalCustomerId,
    });

    // Note: cardId is required in schema but can't be set here since account is created before card
    // This is a temporary workaround - ideally account should be created as part of card creation
    const account = await this.prisma.baasAccount.create({
      data: {
        userId,
        cardId: "PLACEHOLDER", // Will be updated when card is created
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
      // Auto-maintain funding route with optional reference label
      const fundingReference = reference || "";
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
   * Ensure there is a BaasAccount for a specific card (1:1 relationship).
   * Creates a new account for this card if one doesn't exist.
   */
  async ensureAccountForCard(
    cardId: string,
    userId: string,
    walletId: string,
    reference?: string
  ): Promise<BaasAccount> {
    if (!supportsAccountCreation(this.client)) {
      throw new Error("AccountCreationNotSupported");
    }

    // Check if this card already has an account
    const existing = await this.prisma.baasAccount.findUnique({
      where: { cardId },
    });

    if (existing) {
      return existing;
    }

    // Ensure customer exists
    const { provider, externalCustomerId, baasCustomerId } =
      await this.ensureCustomerForUser(userId);

    // Create a new account for this specific card
    const accountResult: CreateAccountResult = await this.client.createAccount({
      externalCustomerId,
    });

    const account = await this.prisma.baasAccount.create({
      data: {
        userId,
        cardId, // 1:1 link to card
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

    // Create funding route linking this account to the card
    const fundingReference = reference || "";
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
        cardId,
        baasAccountId: account.id,
      },
      create: {
        providerName: provider,
        providerAccountId: accountResult.externalAccountId,
        reference: fundingReference,
        walletId,
        userId,
        cardId,
        baasAccountId: account.id,
      },
    });

    console.log(
      `✅ Created account ${account.externalAccountId} for card ${cardId} with funding route`
    );

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
    id?: string;
    provider: BaasProviderName;
    externalCardId: string;
    last4?: string;
    status?: string;
    nickname?: string | null;
  }> {
    const { initializeLedgerForCard } = await import("../../domain/ledger/initLedger.js");

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

    // 3) FIRST: Create internal Card record (so we have a cardId for the account)
    const internalCard = await this.prisma.card.create({
      data: {
        walletId,
        status: "ACTIVE",
      },
    });

    try {
      // 4) Create card-specific Synctera account (1:1 with card)
      const account = await this.ensureAccountForCard(internalCard.id, userId, walletId);

      // 5) Ask provider to create the physical/virtual card
    const cardResult: CreateCardResult = await this.client.createCard({
      userId,
      externalCustomerId,
      externalAccountId: account.externalAccountId,
      embossName: buildEmbossName(user?.name, user?.email),
    } as CreateCardParams);

      // 6) Persist BaasCard mapping (links Synctera card to our internal card)
      const baasCard = await this.prisma.baasCard.create({
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

      // 7) Update internal Card with Synctera card ID
      await this.prisma.card.update({
        where: { id: internalCard.id },
        data: { providerCardId: cardResult.externalCardId },
      });

      // 8) Initialize card-scoped ledgers (pool + member equity accounts)
      await this.prisma.$transaction(async (tx) => {
        await initializeLedgerForCard(tx, internalCard.id, walletId);
      });

      console.log(
        `✅ Card created: internal=${internalCard.id}, external=${cardResult.externalCardId}, account=${account.externalAccountId}`
      );

    return {
        id: baasCard.id,
      provider: cardResult.provider,
      externalCardId: cardResult.externalCardId,
      ...(cardResult.last4 && { last4: cardResult.last4 }),
      status: cardResult.status ?? "ACTIVE",
      nickname: options?.nickname ?? null,
    };
    } catch (error) {
      // Rollback: delete the internal card if any step fails
      await this.prisma.card.delete({
        where: { id: internalCard.id },
      }).catch(() => {
        // Ignore if already deleted
      });
      throw error;
    }
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

  /**
   * Initiate a payout/withdrawal from a BaaS account
   * 
   * @param walletId - Wallet ID for context
   * @param userId - User ID requesting withdrawal
   * @param amountMinor - Amount in minor units (cents)
   * @param reference - Internal reference (withdrawal request ID)
   * @returns Payout result with provider transfer ID
   */
  async initiatePayout({
    walletId,
    userId,
    amountMinor,
    currency = "USD",
    reference,
    metadata,
  }: {
    walletId: string;
    userId: string;
    amountMinor: number;
    currency?: string;
    reference?: string;
    metadata?: any;
  }): Promise<InitiatePayoutResult> {
    // Check if provider supports payouts
    if (!supportsPayouts(this.client)) {
      throw new Error("ProviderDoesNotSupportPayouts");
    }

    // Get the user's BaaS account
    const account = await this.ensureAccountForUser(userId, walletId);

    // Prepare payout parameters
    const payoutParams: InitiatePayoutParams = {
      externalAccountId: account.externalAccountId,
      amountMinor,
      currency,
      reference: reference ?? "",
      metadata: {
        ...metadata,
        walletId,
        userId,
        divviWithdrawalRequestId: reference,
      },
    };

    // Call provider to initiate payout
    const result = await this.client.initiatePayout(payoutParams);

    console.log(
      `[BaasService] Payout initiated: walletId=${walletId}, userId=${userId}, ` +
        `amountMinor=${amountMinor}, providerTransferId=${result.externalTransferId}`
    );

    return result;
  }
}
