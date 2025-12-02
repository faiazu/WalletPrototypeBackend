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
   * Sum of pending holds for a wallet. Used to adjust available balance on auth.
   */
  private async getPendingHoldTotal(walletId: string): Promise<number> {
    const result = await this.prisma.cardAuthHold.aggregate({
      _sum: { amountMinor: true },
      where: {
        walletId,
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

    // Check internal wallet_pool balance minus pending holds.
    // Note: pool is stored as a liability (negative when funded), so negate it for available.
    const walletPoolBalance = await this.ledger.getWalletPoolBalance(walletId);
    const pendingHolds = await this.getPendingHoldTotal(walletId);
    const available = -walletPoolBalance - pendingHolds;
    const payingUserId = card.userId;

    if (available < event.amountMinor) {
      console.warn(
        `[CardProgramService] Authorization declined: insufficient funds. walletId=${walletId}, ` +
          `poolBalance=${walletPoolBalance}, pendingHolds=${pendingHolds}, available=${available}, ` +
          `requested=${event.amountMinor}`
      );
      return "DECLINE";
    }

    // All checks pass -> APPROVE from Divvi's side
    const decision: CardAuthDecision = "APPROVE";

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
          walletId,
          userId: payingUserId,
          amountMinor: event.amountMinor,
          currency: event.currency,
          status: AuthHoldStatus.PENDING,
          metadata: authMetadata,
        },
      });
    } catch (err) {
      console.warn(
        `[CardProgramService] Failed to persist auth hold for authId=${providerAuthId}: ${String(
          err
        )}`
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

    const cardholderUserId = card.userId;

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

    await this.ledger.postCardCapture({
      transactionId: event.providerTransactionId,
      walletId,
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
          console.warn(
            `[CardProgramService] No matching auth hold to clear for providerAuthId=${providerAuthId}`
          );
        }
      } catch (err) {
        console.warn(
          `[CardProgramService] Failed clearing auth hold for providerAuthId=${providerAuthId}: ${String(
            err
          )}`
        );
      }
    }

    console.log(
      `[CardProgramService] Clearing posted to ledger: walletId=${walletId}, ` +
        `cardholderUserId=${cardholderUserId}, amountMinor=${event.amountMinor} ${event.currency}, ` +
        `splits=${JSON.stringify(splits)}`
    );
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
      console.log(
        `[CardProgramService] Auth reversal processed: authId=${providerAuthId}, cardId=${event.providerCardId}`
      );
    } catch (err) {
      console.warn(
        `[CardProgramService] Auth reversal with no matching hold: authId=${providerAuthId}, cardId=${event.providerCardId}`
      );
    }
  }
}
