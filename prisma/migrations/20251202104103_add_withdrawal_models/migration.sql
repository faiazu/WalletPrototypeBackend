-- CreateEnum
CREATE TYPE "WithdrawalRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WithdrawalTransferStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "WithdrawalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "ledgerTransactionId" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalTransfer" (
    "id" TEXT NOT NULL,
    "withdrawalRequestId" TEXT NOT NULL,
    "providerName" "BaasProviderName" NOT NULL,
    "providerTransferId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "WithdrawalTransferStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalRequest_walletId_status_idx" ON "WithdrawalRequest"("walletId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_status_idx" ON "WithdrawalRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalTransfer_withdrawalRequestId_idx" ON "WithdrawalTransfer"("withdrawalRequestId");

-- CreateIndex
CREATE INDEX "WithdrawalTransfer_status_idx" ON "WithdrawalTransfer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalTransfer_providerName_providerTransferId_key" ON "WithdrawalTransfer"("providerName", "providerTransferId");

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalTransfer" ADD CONSTRAINT "WithdrawalTransfer_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
