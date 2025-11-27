// divvi level card logic, ex posing functions to create card programs, manage them etc

import type {
    PrismaClient,
    BaasCard,
} from "../../generated/prisma/client.js";

import type {
  NormalizedCardAuthEvent,
  NormalizedCardClearingEvent,
} from "./baasTypes.js";

/**
 * Simple APPROVE/DECLINE decision type for card authorizations
 */
export type CardAuthDecision = "APPROVE" | "DECLINE";

/**
 * Interface describing what the card program needs from the ledger.
 * We adapt your existing ledgerService to this.
 */
export interface LedgerServiceForCardProgram {
  getWalletPoolBalance(walletId: string): Promise<number>;
  postCardCapture(input: {
    transactionId: string;
    walletId: string;
    splits: Array<{ userId: string; amount: number }>;
    metadata?: any;
  }): Promise<any>;
}

/**
 * Dependencies the CardProgramService needs
 */
export interface CardProgramServiceDeps {
  prisma: PrismaClient;
  ledger: LedgerServiceForCardProgram;
}

/**
 * Default implementation of CardProgramService.
 *
 * - It is provider agnostic: only deals with normalized events, not raw webhooks.
 * - It uses Prisma to map providerCardId -> BaasCard -> (userId, walletId).
 * - It uses the ledger to:
 *    - check available funds on AUTH
 *    - post a real card_capture on CLEARING
 */
export class CardProgramService {
  private prisma: PrismaClient;
  private ledger: LedgerServiceForCardProgram;

  constructor(deps: CardProgramServiceDeps) {
    this.prisma = deps.prisma;
    this.ledger = deps.ledger;
  }

  /**
   * Given a providerCardId from a webhook, find the matching BaasCard row
   */
  private async findCardByExternalId(externalCardId: string): Promise<BaasCard | null> {
    return this.prisma.baasCard.findUnique({
      where: {
        externalCardId,
      },
    });
  }

  /**
   * Helper to assert that a card has a walletId linked.
   *
   * For v1, the simplest design is:
   *   - Each card is tied to a single "active" wallet via card.walletId.
   */
  private requireWalletForCard(card: BaasCard): string {
    if (!card.walletId) {
      throw new Error(
        `[CardProgramService] Card ${card.id} has no walletId assigned`
      );
    }
    return card.walletId;
  }

  /**
   * Handle card authorization (AUTH).
   *
   * Logic:
   *  - Card must exist.
   *  - Card must be ACTIVE.
   *  - Card must be linked to a wallet.
   *  - Wallet must have sufficient wallet_pool balance >= auth amount.
   *
   * If all checks pass, we APPROVE, otherwise DECLINE.
   */
  async handleAuthorization(event: NormalizedCardAuthEvent): Promise<CardAuthDecision> {
    const card = await this.findCardByExternalId(event.providerCardId);

    if (!card) {
      console.warn(
        `[CardProgramService] Authorization for unknown card: providerCardId=${event.providerCardId}`
      );
      return "DECLINE";
    }

    if (card.status !== "ACTIVE") {
      console.warn(
        `[CardProgramService] Authorization for inactive card ${card.id} (status=${card.status})`
      );
      return "DECLINE";
    }

    let walletId: string;
    try {
      walletId = this.requireWalletForCard(card);
    } catch (err) {
      console.warn(String(err));
      return "DECLINE";
    }

    // Check internal wallet_pool balance via ledger
    const walletPoolBalance = await this.ledger.getWalletPoolBalance(walletId);

    if (walletPoolBalance < event.amountMinor) {
      console.warn(
        `[CardProgramService] Authorization declined: insufficient funds. walletId=${walletId}, ` +
          `balance=${walletPoolBalance}, requested=${event.amountMinor}`
      );
      return "DECLINE";
    }

    // All checks pass -> APPROVE from Divvi's side
    return "APPROVE";
  }

  /**
   * Handle card clearing / settlement.
   *
   * This is where we actually move money in the internal ledger.
   *
   * v1 rule:
   *  - The user whose card was used (card.userId) is the "payer".
   *  - The entire transaction amount is allocated to that user.
   *    (Splitting to be added later)
   */
  async handleClearing(event: NormalizedCardClearingEvent): Promise<void> {
    const card = await this.findCardByExternalId(event.providerCardId);

    if (!card) {
      console.warn(
        `[CardProgramService] Clearing for unknown card: providerCardId=${event.providerCardId}`
      );
      return;
    }

    let walletId: string;
    try {
      walletId = this.requireWalletForCard(card);
    } catch (err) {
      console.warn(String(err));
      return;
    }

    const payingUserId = card.userId;

    // Simple v1 split: payer owns 100% of the spend.
    const splits = [
      {
        userId: payingUserId,
        amount: event.amountMinor,
      },
    ];

    const metadata = {
      provider: event.provider,
      providerEventId: event.providerEventId,
      providerTransactionId: event.providerTransactionId,
      providerAuthId: event.providerAuthId,
      providerCardId: event.providerCardId,
      merchantName: event.merchantName,
      merchantCategoryCode: event.merchantCategoryCode,
      merchantCountry: event.merchantCountry,
      network: event.network,
      isCardPresent: event.isCardPresent,
      isOnline: event.isOnline,
      occurredAt: event.occurredAt.toISOString(),
    };

    await this.ledger.postCardCapture({
      transactionId: event.providerTransactionId,
      walletId,
      splits,
      metadata,
    });

    console.log(
      `[CardProgramService] Clearing posted to ledger: walletId=${walletId}, ` +
        `payingUserId=${payingUserId}, amountMinor=${event.amountMinor} ${event.currency}`
    );
  }
}

