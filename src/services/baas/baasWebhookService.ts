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
  NormalizedPayoutStatusEvent,
  NormalizedKycVerificationEvent,
  NormalizedAccountStatusEvent,
  NormalizedCardStatusEvent,
} from "./baasTypes.js";
import { logger } from "../../core/logger.js";
import { webhookCounter, webhookLatency } from "../../core/metrics.js";

import { fundingRouteService } from "./fundingRouteService.js";
import { withdrawalService } from "../wallet/withdrawalService.js";
import { ledgerService } from "../ledger/ledgerService.js";

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
  ensureAccountForUser?: (userId: string) => Promise<any>;
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
  private ensureAccountForUser: ((userId: string) => Promise<any>) | undefined;

  constructor(deps: BaasWebhookServiceDeps) {
    this.prisma = deps.prisma;
    this.cardProgramService = deps.cardProgramService;
    this.ledger = deps.ledger;
    this.ensureAccountForUser = deps.ensureAccountForUser;
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
    const startTime = Date.now();
    let status = "success";

    try {
      const { isDuplicate } = await this.recordEvent(providerName, event);
      if (isDuplicate) {
        logger.info(
          { provider: providerName, eventId: event.providerEventId, event: "webhook" },
          "Duplicate event ignored"
        );
        webhookCounter.inc({ provider: providerName, eventType: event.type, status: "duplicate" });
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

    if (event.type === "PAYOUT_STATUS") {
      await this.handlePayoutStatus(event as NormalizedPayoutStatusEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    if (event.type === "ACCOUNT_STATUS") {
      await this.handleAccountStatus(event as NormalizedAccountStatusEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

    if (event.type === "CARD_STATUS") {
      await this.handleCardStatus(event as NormalizedCardStatusEvent);
      await this.markEventProcessed(providerName, event.providerEventId);
      return;
    }

      const unmatchedEvent = event as NormalizedBaasEvent;

      logger.warn(
        { eventType: unmatchedEvent.type, provider: providerName, event: "webhook" },
        "Unhandled event type"
      );
      await this.markEventProcessed(providerName, unmatchedEvent.providerEventId);
    } catch (err) {
      status = "error";
      throw err;
    } finally {
      // Record metrics
      webhookCounter.inc({ provider: providerName, eventType: event.type, status });
      const duration = (Date.now() - startTime) / 1000;
      webhookLatency.observe({ provider: providerName, eventType: event.type }, duration);
    }
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
      logger.error(
        {
          authId: event.providerAuthId,
          cardId: event.providerCardId,
          error: String(err),
          event: "card_auth_reversal"
        },
        "Failed to process auth reversal"
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

    logger.info(
      {
        decision,
        transactionId: event.providerTransactionId,
        cardId: event.providerCardId,
        amountMinor: event.amountMinor,
        event: "card_auth"
      },
      "Card auth processed"
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

    logger.info(
      {
        transactionId: event.providerTransactionId,
        cardId: event.providerCardId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        event: "card_clearing"
      },
      "Card clearing handled"
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
      logger.warn(
        { personId: event.personId, event: "kyc_verification" },
        "KYC verification: no user mapping found"
      );
      return;
    }

    await this.prisma.user.update({
      where: { id: customer.userId },
      data: { kycStatus: event.verificationStatus },
    });

    if (
      event.verificationStatus === "ACCEPTED" &&
      typeof this.ensureAccountForUser === "function"
    ) {
      try {
        await this.ensureAccountForUser(customer.userId);
      } catch (err) {
        logger.error(
          { userId: customer.userId, error: String(err), event: "kyc_verification" },
          "Failed to ensure account after KYC"
        );
      }
    }

    logger.info(
      { userId: customer.userId, status: event.verificationStatus, event: "kyc_verification" },
      "KYC status updated"
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
      // Emit structured warning for monitoring/alerting
      const warning = {
        severity: "ERROR",
        code: "FUNDING_ROUTE_NOT_FOUND",
        message: "Wallet funding route not found after all fallback attempts",
        context: {
          provider: event.provider,
          providerAccountId: event.providerAccountId,
          reference: event.reference ?? null,
          providerEventId: event.providerEventId,
          providerTransactionId: event.providerTransactionId,
          amountMinor: event.amountMinor,
          currency: event.currency,
          timestamp: new Date().toISOString(),
        },
      };

      logger.error(warning, "Funding route not found after all fallback attempts");
      
      // We still mark the event processed so we don't retry forever.
      // Ops should monitor these logs to spot misconfigured routes.
      return;
    }

    // CARD-CENTRIC FUNDING: Route to specific card's ledger
    if (!route.cardId) {
      logger.error(
        {
          provider: event.provider,
          providerAccountId: event.providerAccountId,
          event: "wallet_funding"
        },
        "Funding route missing cardId"
      );
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

    // Use card-specific deposit method
    await ledgerService.postCardDeposit({
      transactionId: event.providerTransactionId,
      cardId: route.cardId,
      userId: route.userId,
      amount: event.amountMinor,
      metadata,
    });

    logger.info(
      {
        cardId: route.cardId,
        userId: route.userId,
        walletId: route.walletId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        event: "wallet_funding"
      },
      "Card funding posted"
    );
  }

  /**
   * Look up a BaasFundingRoute for a WALLET_FUNDING event.
   *
   * Attempts fallback strategies:
   * 1. Try exact match with provided reference
   * 2. Try default route (empty reference) for the same account
   *
   * We use:
   *  - providerName = event.provider
   *  - providerAccountId = event.providerAccountId
   *  - reference = event.reference (can be null)
   */
  private async findFundingRoute(
    event: NormalizedWalletFundingEvent
  ): Promise<BaasFundingRoute | null> {
    // Try exact match first
    const route = await fundingRouteService.findRoute({
      providerName: event.provider,
      providerAccountId: event.providerAccountId,
      reference: event.reference,
    });

    if (route) {
      return route;
    }

    // Fallback 1: Try default route (empty reference) if specific reference failed
    if (event.reference) {
      logger.warn(
        {
          reference: event.reference,
          provider: event.provider,
          providerAccountId: event.providerAccountId,
          event: "wallet_funding"
        },
        "Funding route not found with reference, trying default route"
      );

      const defaultRoute = await fundingRouteService.findRoute({
        providerName: event.provider,
        providerAccountId: event.providerAccountId,
        reference: "",
      });

      if (defaultRoute) {
        return defaultRoute;
      }
    }

    return null;
  }

  private async handleAccountStatus(
    event: NormalizedAccountStatusEvent
  ): Promise<void> {
    const data: any = {
      updatedAt: new Date(),
    };

    if (typeof event.status !== "undefined") {
      data.status = event.status;
    }
    if (typeof event.accessStatus !== "undefined") {
      data.accessStatus = event.accessStatus;
    }

    const result = await this.prisma.baasAccount.updateMany({
      where: {
        providerName: event.provider,
        externalAccountId: event.providerAccountId,
      },
      data,
    });

    if (result.count === 0) {
      logger.warn(
        { providerAccountId: event.providerAccountId, event: "account_status" },
        "Account status event with no mapping"
      );
    }
  }

  private async handleCardStatus(event: NormalizedCardStatusEvent): Promise<void> {
    const data: any = {
      updatedAt: new Date(),
    };

    if (typeof event.status !== "undefined") {
      data.status = event.status;
    }

    const result = await this.prisma.baasCard.updateMany({
      where: {
        providerName: event.provider,
        externalCardId: event.providerCardId,
      },
      data,
    });

    if (result.count === 0) {
      logger.warn(
        { providerCardId: event.providerCardId, event: "card_status" },
        "Card status event with no mapping"
      );
    }
  }

  /**
   * Handle payout/withdrawal status updates from provider
   * 
   * Completes or reverses pending withdrawals based on provider confirmation
   */
  private async handlePayoutStatus(event: NormalizedPayoutStatusEvent): Promise<void> {
    // Find withdrawal transfer by provider ID
    const transfer = await withdrawalService.findTransferByProviderId(
      event.provider,
      event.providerTransferId
    );

    if (!transfer) {
      logger.warn(
        {
          providerTransferId: event.providerTransferId,
          provider: event.provider,
          status: event.status,
          event: "payout_status"
        },
        "Payout transfer not found"
      );
      return;
    }

    const request = transfer.withdrawalRequest;

    try {
      if (event.status === "COMPLETED") {
        // Finalize withdrawal: move from pending to completed
        await withdrawalService.completeWithdrawalTransfer(transfer.id);

        // Finalize in ledger: move from pending_withdrawal to wallet_pool
        const ledgerTransactionId = `withdrawal_finalize_${request.id}`;
        await ledgerService.finalizeWithdrawal({
          transactionId: ledgerTransactionId,
          walletId: request.walletId,
          amount: request.amountMinor,
          metadata: {
            withdrawalRequestId: request.id,
            providerTransferId: event.providerTransferId,
            completedAt: event.occurredAt,
          },
        });

        logger.info(
          {
            requestId: request.id,
            walletId: request.walletId,
            userId: request.userId,
            cardId: request.cardId,
            amountMinor: request.amountMinor,
            event: "payout_completed"
          },
          "Withdrawal completed"
        );
      } else if (event.status === "FAILED" || event.status === "REVERSED") {
        // Mark as failed
        await withdrawalService.failWithdrawalTransfer(
          transfer.id,
          event.failureReason || `Provider reported ${event.status}`
        );

        // Reverse in ledger: return from pending_withdrawal to member_equity
        const ledgerTransactionId = `withdrawal_reverse_${request.id}`;
        await ledgerService.reversePendingWithdrawal({
          transactionId: ledgerTransactionId,
          walletId: request.walletId,
          userId: request.userId,
          amount: request.amountMinor,
          metadata: {
            withdrawalRequestId: request.id,
            providerTransferId: event.providerTransferId,
            failureReason: event.failureReason,
            failedAt: event.occurredAt,
          },
        });

        logger.warn(
          {
            requestId: request.id,
            walletId: request.walletId,
            userId: request.userId,
            cardId: request.cardId,
            reason: event.failureReason || 'Unknown',
            event: "payout_failed"
          },
          "Withdrawal failed or reversed"
        );

        // TODO: Emit alert/notification for failed withdrawal
      }
    } catch (err) {
      logger.error(
        {
          requestId: request.id,
          providerTransferId: event.providerTransferId,
          error: String(err),
          event: "payout_status"
        },
        "Error processing payout status"
      );
      throw err;
    }
  }
}
