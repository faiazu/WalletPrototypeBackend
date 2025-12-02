import { prisma } from "../../core/db.js";
import { PrismaClient, WithdrawalRequest, WithdrawalTransfer } from "../../generated/prisma/client.js";
import { WithdrawalRequestStatus, WithdrawalTransferStatus, BaasProviderName } from "../../generated/prisma/enums.js";
import { ledgerService } from "../ledger/ledgerService.js";
import { isMember } from "./memberService.js";

/**
 * WithdrawalService
 * 
 * Manages withdrawal requests and coordinates between ledger and BaaS providers.
 * Implements two-phase commit pattern:
 * 1. Create request + move funds to pending liability
 * 2. Initiate provider payout
 * 3. Finalize on webhook confirmation
 */
export class WithdrawalService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a new withdrawal request
   * 
   * Validates:
   * - User is wallet member
   * - User has sufficient equity
   * - Amount is positive
   * 
   * Creates request with PENDING status
   */
  async createWithdrawalRequest({
    walletId,
    userId,
    amountMinor,
    currency = "USD",
    metadata,
  }: {
    walletId: string;
    userId: string;
    amountMinor: number;
    currency?: string;
    metadata?: any;
  }): Promise<WithdrawalRequest> {
    // Validate user is wallet member
    if (!(await isMember(walletId, userId))) {
      throw new Error("UserNotMember");
    }

    // Validate amount is positive
    if (amountMinor <= 0) {
      throw new Error("InvalidAmount");
    }

    // Check user equity
    const equityAccount = await ledgerService.getMemberEquityAccount(walletId, userId);
    if (equityAccount.balance < amountMinor) {
      throw new Error("InsufficientEquity");
    }

    // Create withdrawal request
    const request = await this.prisma.withdrawalRequest.create({
      data: {
        walletId,
        userId,
        amountMinor,
        currency,
        status: WithdrawalRequestStatus.PENDING,
        metadata: metadata ?? null,
      },
      include: {
        wallet: true,
        user: true,
      },
    });

    return request;
  }

  /**
   * Create a withdrawal transfer linked to a request
   * 
   * This represents the actual payout attempt with a provider
   */
  async createWithdrawalTransfer({
    withdrawalRequestId,
    providerName,
    providerTransferId,
    amountMinor,
    currency = "USD",
    metadata,
  }: {
    withdrawalRequestId: string;
    providerName: BaasProviderName;
    providerTransferId?: string;
    amountMinor: number;
    currency?: string;
    metadata?: any;
  }): Promise<WithdrawalTransfer> {
    const transfer = await this.prisma.withdrawalTransfer.create({
      data: {
        withdrawalRequestId,
        providerName,
        providerTransferId: providerTransferId ?? null,
        amountMinor,
        currency,
        status: WithdrawalTransferStatus.PENDING,
        metadata: metadata ?? null,
      },
    });

    // Update request status to PROCESSING
    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalRequestId },
      data: { status: WithdrawalRequestStatus.PROCESSING },
    });

    return transfer;
  }

  /**
   * Mark withdrawal transfer as completed
   * Called by webhook handler when provider confirms payout
   */
  async completeWithdrawalTransfer(
    transferId: string
  ): Promise<{ transfer: WithdrawalTransfer; request: WithdrawalRequest }> {
    const transfer = await this.prisma.withdrawalTransfer.update({
      where: { id: transferId },
      data: {
        status: WithdrawalTransferStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: {
        withdrawalRequest: true,
      },
    });

    // Update request status to COMPLETED
    const request = await this.prisma.withdrawalRequest.update({
      where: { id: transfer.withdrawalRequestId },
      data: {
        status: WithdrawalRequestStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return { transfer, request };
  }

  /**
   * Mark withdrawal transfer as failed
   * Called by webhook handler when provider reports failure
   */
  async failWithdrawalTransfer(
    transferId: string,
    failureReason: string
  ): Promise<{ transfer: WithdrawalTransfer; request: WithdrawalRequest }> {
    const transfer = await this.prisma.withdrawalTransfer.update({
      where: { id: transferId },
      data: {
        status: WithdrawalTransferStatus.FAILED,
        failureReason,
        failedAt: new Date(),
      },
      include: {
        withdrawalRequest: true,
      },
    });

    // Update request status to FAILED
    const request = await this.prisma.withdrawalRequest.update({
      where: { id: transfer.withdrawalRequestId },
      data: {
        status: WithdrawalRequestStatus.FAILED,
        failureReason,
        failedAt: new Date(),
      },
    });

    return { transfer, request };
  }

  /**
   * Find withdrawal transfer by provider ID
   * Used by webhook handlers to look up transfers
   */
  async findTransferByProviderId(
    providerName: BaasProviderName,
    providerTransferId: string
  ): Promise<WithdrawalTransfer | null> {
    return this.prisma.withdrawalTransfer.findUnique({
      where: {
        providerName_providerTransferId: {
          providerName,
          providerTransferId,
        },
      },
      include: {
        withdrawalRequest: {
          include: {
            wallet: true,
            user: true,
          },
        },
      },
    });
  }

  /**
   * Get withdrawal history for a user
   */
  async getWithdrawalsByUser(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: WithdrawalRequestStatus;
    }
  ): Promise<WithdrawalRequest[]> {
    return this.prisma.withdrawalRequest.findMany({
      where: {
        userId,
        ...(options?.status && { status: options.status }),
      },
      include: {
        wallet: true,
        transfers: true,
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Get withdrawal history for a wallet
   */
  async getWithdrawalsByWallet(
    walletId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: WithdrawalRequestStatus;
    }
  ): Promise<WithdrawalRequest[]> {
    return this.prisma.withdrawalRequest.findMany({
      where: {
        walletId,
        ...(options?.status && { status: options.status }),
      },
      include: {
        user: true,
        transfers: true,
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Get specific withdrawal request by ID
   */
  async getWithdrawalRequest(requestId: string): Promise<WithdrawalRequest | null> {
    return this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
      include: {
        wallet: true,
        user: true,
        transfers: true,
      },
    });
  }

  /**
   * Cancel a pending withdrawal request
   * Only works for PENDING status (before provider processing begins)
   */
  async cancelWithdrawalRequest(requestId: string): Promise<WithdrawalRequest> {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error("WithdrawalRequestNotFound");
    }

    if (request.status !== WithdrawalRequestStatus.PENDING) {
      throw new Error("CannotCancelProcessingWithdrawal");
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: WithdrawalRequestStatus.CANCELLED,
        updatedAt: new Date(),
      },
    });
  }
}

// Singleton instance
export const withdrawalService = new WithdrawalService(prisma);

