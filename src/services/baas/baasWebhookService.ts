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

    if (
      event.verificationStatus === "ACCEPTED" &&
      typeof this.ensureAccountForUser === "function"
    ) {
      try {
        await this.ensureAccountForUser(customer.userId);
      } catch (err) {
        console.warn(
          `[BaasWebhookService] Failed to ensure account after KYC for user ${customer.userId}: ${String(err)}`
        );
      }
    }

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

      console.error(`[BaasWebhookService] ${JSON.stringify(warning)}`);
      
      // We still mark the event processed so we don't retry forever.
      // Ops should monitor these logs to spot misconfigured routes.
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
      console.warn(
        `[BaasWebhookService] Funding route not found with reference="${event.reference}", ` +
          `trying default route for provider=${event.provider}, accountId=${event.providerAccountId}`
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
      console.warn(
        `[BaasWebhookService] Account status event with no mapping: providerAccountId=${event.providerAccountId}`
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
      console.warn(
        `[BaasWebhookService] Card status event with no mapping: providerCardId=${event.providerCardId}`
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
      console.warn(
        `[BaasWebhookService] PAYOUT_STATUS_NOT_FOUND: providerTransferId=${event.providerTransferId}, ` +
          `provider=${event.provider}, status=${event.status}`
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

        console.log(
          `[BaasWebhookService] Withdrawal completed: requestId=${request.id}, ` +
            `walletId=${request.walletId}, userId=${request.userId}, ` +
            `amountMinor=${request.amountMinor}`
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

        console.warn(
          `[BaasWebhookService] Withdrawal failed/reversed: requestId=${request.id}, ` +
            `walletId=${request.walletId}, userId=${request.userId}, ` +
            `reason="${event.failureReason || 'Unknown'}"`
        );

        // TODO: Emit alert/notification for failed withdrawal
      }
    } catch (err) {
      console.error(
        `[BaasWebhookService] Error processing payout status: ` +
          `requestId=${request.id}, providerTransferId=${event.providerTransferId}, ` +
          `error=${String(err)}`
      );
      throw err;
    }
  }
}
