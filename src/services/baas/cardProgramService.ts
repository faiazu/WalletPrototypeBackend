// divvi level card logic, ex posing functions to create card programs, manage them etc

import type {
    PrismaClient,
    BaasCard,
} from "../../generated/prisma/client.js";

import type {
  NormalizedCardAuthEvent,
  NormalizedCardAuthReversalEvent,
  NormalizedCardClearingEvent,
} from "./baasTypes.js";

import { AuthHoldStatus } from "../../generated/prisma/enums.js";
import type { SplittingPolicyService } from "../wallet/splittingPolicyService.js";
import { logger } from "../../core/logger.js";
import { cardAuthCounter, cardClearingCounter } from "../../core/metrics.js";

/**
 * Simple APPROVE/DECLINE decision type for card authorizations
 */
export type CardAuthDecision = "APPROVE" | "DECLINE";

/**
 * Interface describing what the card program needs from the ledger.
 * We adapt your existing ledgerService to this.
 */
export interface LedgerServiceForCardProgram {
  getCardPoolAccount(cardId: string): Promise<{ balance: number }>;
  postCardCaptureNew(input: {
    transactionId: string;
    cardId: string;
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
  splittingPolicyService: SplittingPolicyService;
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
  private splittingPolicyService: SplittingPolicyService;

  constructor(deps: CardProgramServiceDeps) {
    this.prisma = deps.prisma;
    this.ledger = deps.ledger;
    this.splittingPolicyService = deps.splittingPolicyService;
  }

  /**
   * Sum of pending holds for a specific card. Used to adjust available balance on auth.
   */
  private async getPendingHoldTotal(cardId: string): Promise<number> {
    const result = await this.prisma.cardAuthHold.aggregate({
      _sum: { amountMinor: true },
      where: {
        cardId,
        status: AuthHoldStatus.PENDING,
      },
    });
    return result._sum.amountMinor ?? 0;
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
      logger.warn(
        { providerCardId: event.providerCardId, event: "card_auth" },
        "Authorization declined: unknown card"
      );
      cardAuthCounter.inc({ decision: "DECLINE", walletId: "unknown" });
      return "DECLINE";
    }

    if (card.status !== "ACTIVE") {
      logger.warn(
        { cardId: card.id, status: card.status, event: "card_auth" },
        "Authorization declined: inactive card"
      );
      cardAuthCounter.inc({ decision: "DECLINE", walletId: card.walletId || "unknown" });
      return "DECLINE";
    }

    let walletId: string;
    try {
      walletId = this.requireWalletForCard(card);
    } catch (err) {
      logger.warn({ cardId: card.id, error: String(err), event: "card_auth" }, "Authorization declined: wallet requirement failed");
      cardAuthCounter.inc({ decision: "DECLINE", walletId: card.walletId || "unknown" });
      return "DECLINE";
    }

    // Find internal Card record
    const internalCard = await this.prisma.card.findFirst({
      where: {
        walletId,
        providerCardId: event.providerCardId,
      },
    });

    if (!internalCard) {
      logger.warn(
        { providerCardId: event.providerCardId, event: "card_auth" },
        "Authorization declined: internal card not found"
      );
      cardAuthCounter.inc({ decision: "DECLINE", walletId });
      return "DECLINE";
    }

    // Check CARD-SPECIFIC pool balance minus pending holds
    // Note: pool is stored as a liability (negative when funded), so negate it for available
    const cardPoolAccount = await this.ledger.getCardPoolAccount(internalCard.id);
    const pendingHolds = await this.getPendingHoldTotal(internalCard.id);
    const available = -cardPoolAccount.balance - pendingHolds;
    const payingUserId = card.userId;

    if (available < event.amountMinor) {
      logger.warn(
        {
          walletId,
          cardId: internalCard.id,
          poolBalance: walletPoolBalance,
          pendingHolds,
          available,
          requested: event.amountMinor,
          event: "card_auth"
        },
        "Authorization declined: insufficient funds"
      );
      cardAuthCounter.inc({ decision: "DECLINE", walletId });
      return "DECLINE";
    }

    // All checks pass -> APPROVE from Divvi's side
    const decision: CardAuthDecision = "APPROVE";

    // Record metrics
    cardAuthCounter.inc({ decision, walletId });

    // Persist a hold for traceability (no funds move on auth yet)
    const providerAuthId = event.providerTransactionId;
    const authMetadata = {
      occurredAt: event.occurredAt.toISOString(),
      merchantName: event.merchantName,
      merchantCategoryCode: event.merchantCategoryCode,
      merchantCountry: event.merchantCountry,
      network: event.network,
      isCardPresent: event.isCardPresent,
      isOnline: event.isOnline,
      raw: event.rawPayload ?? null,
    } as const;
    try {
      await this.prisma.cardAuthHold.upsert({
        where: {
          providerName_providerAuthId: {
            providerName: event.provider,
            providerAuthId,
          },
        },
        update: {
          status: AuthHoldStatus.PENDING,
          amountMinor: event.amountMinor,
          currency: event.currency,
          metadata: authMetadata,
        },
        create: {
          providerName: event.provider,
          providerAuthId,
          providerCardId: event.providerCardId,
          cardId: internalCard.id,
          walletId,
          userId: payingUserId,
          amountMinor: event.amountMinor,
          currency: event.currency,
          status: AuthHoldStatus.PENDING,
          metadata: authMetadata,
        },
      });
    } catch (err) {
      logger.error(
        { authId: providerAuthId, error: String(err), event: "card_auth" },
        "Failed to persist auth hold"
      );
    }

    return decision;
  }

  /**
   * Handle card clearing / settlement.
   *
   * This is where we actually move money in the internal ledger.
   *
   * Splitting logic is now driven by wallet spend policy:
   *  - PAYER_ONLY: cardholder pays 100%
   *  - EQUAL_SPLIT: amount divided equally among all wallet members
   */
  async handleClearing(event: NormalizedCardClearingEvent): Promise<void> {
    const baasCard = await this.findCardByExternalId(event.providerCardId);

    if (!baasCard) {
      logger.warn(
        { providerCardId: event.providerCardId, event: "card_clearing" },
        "Clearing skipped: unknown card"
      );
      return;
    }

    let walletId: string;
    try {
      walletId = this.requireWalletForCard(baasCard);
    } catch (err) {
      logger.warn({ cardId: baasCard.id, error: String(err), event: "card_clearing" }, "Clearing skipped: wallet requirement failed");
      return;
    }

    // Find internal Card record
    const internalCard = await this.prisma.card.findFirst({
      where: {
        walletId,
        providerCardId: event.providerCardId,
      },
    });

    if (!internalCard) {
      logger.warn(
        { providerCardId: event.providerCardId, event: "card_clearing" },
        "Clearing skipped: internal card not found"
      );
      return;
    }

    const cardholderUserId = baasCard.userId;

    // Calculate splits based on wallet's spend policy
    const policyBasedSplits = await this.splittingPolicyService.calculateSplits(
      walletId,
      cardholderUserId,
      event.amountMinor
    );

    // Convert to ledger format
    const splits = policyBasedSplits.map(split => ({
      userId: split.userId,
      amount: split.amountMinor,
    }));

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

    // Use card-specific capture method
    await this.ledger.postCardCaptureNew({
      transactionId: event.providerTransactionId,
      cardId: internalCard.id,
      splits,
      metadata,
    });

    // Mark related hold as cleared (if present)
    const providerAuthId = event.providerAuthId ?? event.providerTransactionId;
    if (providerAuthId) {
      try {
        const result = await this.prisma.cardAuthHold.updateMany({
          where: {
            providerName: event.provider,
            providerAuthId,
          },
          data: {
            status: AuthHoldStatus.CLEARED,
            clearedAt: new Date(),
          },
        });
        if (result.count === 0) {
          logger.warn(
            { authId: providerAuthId, event: "card_clearing" },
            "No matching auth hold to clear"
          );
        }
      } catch (err) {
        logger.error(
          { authId: providerAuthId, error: String(err), event: "card_clearing" },
          "Failed clearing auth hold"
        );
      }
    }

    logger.info(
      {
        walletId,
        cardId: internalCard.id,
        cardholderUserId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        splits,
        event: "card_clearing"
      },
      "Clearing posted to ledger"
    );

    // Record metrics
    cardClearingCounter.inc({ walletId });
  }

  /**
   * Handle auth reversal/void by marking the hold reversed.
   * No ledger movement (we don't post on auth).
   */
  async handleAuthReversal(event: NormalizedCardAuthReversalEvent): Promise<void> {
    const providerAuthId = event.providerAuthId;
    try {
      await this.prisma.cardAuthHold.update({
        where: {
          providerName_providerAuthId: {
            providerName: event.provider,
            providerAuthId,
          },
        },
        data: {
          status: AuthHoldStatus.REVERSED,
          reversedAt: new Date(),
        },
      });
      logger.info(
        { authId: providerAuthId, cardId: event.providerCardId, event: "card_auth_reversal" },
        "Auth reversal processed"
      );
    } catch (err) {
      logger.warn(
        { authId: providerAuthId, cardId: event.providerCardId, event: "card_auth_reversal" },
        "Auth reversal: no matching hold found"
      );
    }
  }
}
