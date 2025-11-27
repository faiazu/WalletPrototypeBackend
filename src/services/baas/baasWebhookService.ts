// process incoming webhooks from BaaS provider

import type {
  PrismaClient,
  BaasEvent,
  BaasProviderName,
  BaasFundingRoute,
} from "../../generated/prisma/client.js";

import type {
  NormalizedBaasEvent,
  NormalizedCardAuthEvent,
  NormalizedCardAuthReversalEvent,
  NormalizedCardClearingEvent,
  NormalizedWalletFundingEvent,
  NormalizedKycVerificationEvent,
} from "./baasTypes.js";

import type { CardProgramService, CardAuthDecision } from "./cardProgramService.js";

/**
 * Minimal interface for what is needed from the ledger for funding events.
 */
export interface LedgerServiceForFunding {
  postDeposit(input: {
    transactionId: string;
    walletId: string;
    userId: string;
    amount: number;
    metadata?: any;
  }): Promise<any>;
}

/**
 * Dependencies for BaasWebhookService.
 */
export interface BaasWebhookServiceDeps {
  prisma: PrismaClient;
  cardProgramService: CardProgramService;
  ledger: LedgerServiceForFunding;
}

/**
 * Service responsible for:
 *  - Recording BaaS webhook events in the DB (BaasEvent)
 *  - Ensuring idempotency on (providerName, providerEventId)
 *  - Dispatching to the appropriate handler (card auth, clearing, funding)
 */
export class BaasWebhookService {
  private prisma: PrismaClient;
  private cardProgramService: CardProgramService;
  private ledger: LedgerServiceForFunding;

  constructor(deps: BaasWebhookServiceDeps) {
    this.prisma = deps.prisma;
    this.cardProgramService = deps.cardProgramService;
    this.ledger = deps.ledger;
  }

  /**
   * Insert a BaasEvent row unless one already exists for this provider + eventId.
   *
   * Returns:
   *  - baasEvent: the row in the DB
   *  - isDuplicate: true if we had already seen this event
   */
  private async recordEvent(
    providerName: BaasProviderName,
    event: NormalizedBaasEvent
  ): Promise<{ baasEvent: BaasEvent; isDuplicate: boolean }> {
    const existing = await this.prisma.baasEvent.findUnique({
      where: {
        providerName_providerEventId: {
          providerName,
          providerEventId: event.providerEventId,
        },
      },
    });

    if (existing) {
      return { baasEvent: existing, isDuplicate: true };
    }

    const created = await this.prisma.baasEvent.create({
      data: {
        providerName,
        providerEventId: event.providerEventId,
        type: event.type,
        payload: event.rawPayload as any,
      },
    });

    return { baasEvent: created, isDuplicate: false };
  }

  /**
   * Mark the BaasEvent as processed (sets processedAt = now()).
   */
  private async markEventProcessed(
    providerName: BaasProviderName,
    providerEventId: string
  ): Promise<void> {
    await this.prisma.baasEvent.update({
      where: {
        providerName_providerEventId: {
          providerName,
          providerEventId,
        },
      },
      data: {
        processedAt: new Date(),
      },
    });
  }

  /**
   * Public entry point: handle a single normalized event.
   *
   * Called by provider adapters AFTER:
   *  - verifying webhook authenticity, and
   *  - mapping raw JSON -> NormalizedBaasEvent.
   */
  async handleNormalizedEvent(event: NormalizedBaasEvent): Promise<void> {
    const providerName = event.provider;

    const { isDuplicate } = await this.recordEvent(providerName, event);
    if (isDuplicate) {
      console.log(
        `[BaasWebhookService] Duplicate event ignored: provider=${providerName}, eventId=${event.providerEventId}`
      );
      return;
    }

    // Dispatch by type
    if (event.type === "CARD_AUTH") {
      await this.handleCardAuth(event as NormalizedCardAuthEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    if (event.type === "CARD_CLEARING") {
      await this.handleCardClearing(event as NormalizedCardClearingEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    if (event.type === "CARD_AUTH_REVERSAL") {
      await this.handleCardAuthReversal(event as NormalizedCardAuthReversalEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    if (event.type === "KYC_VERIFICATION") {
      await this.handleKycVerification(event as NormalizedKycVerificationEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    if (event.type === "WALLET_FUNDING") {
      await this.handleWalletFunding(event as NormalizedWalletFundingEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    const unmatchedEvent = event as NormalizedBaasEvent;

    console.warn(
      `[BaasWebhookService] Unhandled event type: ${unmatchedEvent.type} from provider=${providerName}`
    );
    await this.markEventProcessed(providerName, unmatchedEvent.providerEventId);
  }

  /**
   * Handle an auth reversal/void by marking the hold reversed.
   */
  private async handleCardAuthReversal(
    event: NormalizedCardAuthReversalEvent
  ): Promise<void> {
    try {
      await this.cardProgramService.handleAuthReversal(event);
    } catch (err) {
      console.warn(
        `[BaasWebhookService] Failed to process auth reversal: authId=${event.providerAuthId}, ` +
          `cardId=${event.providerCardId}, err=${String(err)}`
      );
    }
  }

  /**
   * Handle a CARD_AUTH event by delegating to CardProgramService.
   *
   * NOTE (Stripe vs Marqeta etc.):
   *  - For async webhooks (Stripe Issuing style), this is perfect: adapter
   *    normalizes event -> this method -> CardProgramService decides.
   */
  private async handleCardAuth(
    event: NormalizedCardAuthEvent
  ): Promise<void> {
    const decision: CardAuthDecision =
      await this.cardProgramService.handleAuthorization(event);

    console.log(
      `[BaasWebhookService] Card auth processed: decision=${decision}, ` +
        `txId=${event.providerTransactionId}, cardId=${event.providerCardId}`
    );
  }

  /**
   * Handle a CARD_CLEARING event by delegating to CardProgramService,
   * which will post a card_capture into the internal ledger.
   */
  private async handleCardClearing(
    event: NormalizedCardClearingEvent
  ): Promise<void> {
    await this.cardProgramService.handleClearing(event);

    console.log(
      `[BaasWebhookService] Card clearing handled: txId=${event.providerTransactionId}, ` +
        `cardId=${event.providerCardId}, amount=${event.amountMinor} ${event.currency}`
    );
  }

  /**
   * Handle a KYC_VERIFICATION event: update user kycStatus based on personId mapping.
   */
  private async handleKycVerification(
    event: NormalizedKycVerificationEvent
  ): Promise<void> {
    const customer = await this.prisma.baasCustomer.findFirst({
      where: {
        externalCustomerId: event.personId,
        providerName: event.provider,
      },
    });

    if (!customer) {
      console.warn(
        `[BaasWebhookService] KYC verification: no user mapping found for personId=${event.personId}`
      );
      return;
    }

    await this.prisma.user.update({
      where: { id: customer.userId },
      data: { kycStatus: event.verificationStatus },
    });

    console.log(
      `[BaasWebhookService] KYC status updated: userId=${customer.userId}, status=${event.verificationStatus}`
    );
  }

  /**
   * Handle a WALLET_FUNDING event.
   *
   * Design notes:
   *  - Each wallet has one or more BaasFundingRoute rows.
   *  - Each route maps (providerName, providerAccountId, reference?) to:
   *      - walletId (which shared wallet to top up)
   *      - userId (which member's equity to credit)
   *  - On funding:
   *      - top up wallet_pool for walletId
   *      - credit member_equity for userId by the same amount
   */
  private async handleWalletFunding(
    event: NormalizedWalletFundingEvent
  ): Promise<void> {
    const route = await this.findFundingRoute(event);

    if (!route) {
      console.warn(
        `[BaasWebhookService] Wallet funding route not found: ` +
          `provider=${event.provider}, accountId=${event.providerAccountId}, reference=${event.reference ?? "null"}`
      );
      // We still mark the event processed so we don't retry forever.
      return;
    }

    const metadata = {
      provider: event.provider,
      providerEventId: event.providerEventId,
      providerTransactionId: event.providerTransactionId,
      providerAccountId: event.providerAccountId,
      reference: event.reference,
      fundingMethod: event.fundingMethod,
      occurredAt: event.occurredAt.toISOString(),
    };

    await this.ledger.postDeposit({
      transactionId: event.providerTransactionId,
      walletId: route.walletId,
      userId: route.userId,
      amount: event.amountMinor,
      metadata,
    });

    console.log(
      `[BaasWebhookService] Wallet funding posted: walletId=${route.walletId}, ` +
        `userId=${route.userId}, amount=${event.amountMinor} ${event.currency}`
    );
  }

  /**
   * Look up a BaasFundingRoute for a WALLET_FUNDING event.
   *
   * We use:
   *  - providerName = event.provider
   *  - providerAccountId = event.providerAccountId
   *  - reference = event.reference (can be null)
   */
  private async findFundingRoute(
    event: NormalizedWalletFundingEvent
  ): Promise<BaasFundingRoute | null> {
    const route = await this.prisma.baasFundingRoute.findFirst({
      where: {
        providerName: event.provider,
        providerAccountId: event.providerAccountId,
        reference: event.reference ?? null,
      },
    });

    return route;
  }
}
