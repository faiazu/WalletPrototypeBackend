-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('VIRTUAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "CardProvider" AS ENUM ('SYNCTERA');

-- CreateEnum
CREATE TYPE "WalletRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "LedgerScope" AS ENUM ('CARD_POOL', 'CARD_MEMBER_EQUITY', 'CARD_PENDING_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "LedgerEntryKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_PAYOUT', 'CARD_AUTH', 'CARD_CLEARING', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AuthHoldStatus" AS ENUM ('PENDING', 'CLEARED', 'REVERSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WithdrawalTransferStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('CARD_AUTH', 'CARD_CLEARING', 'CARD_STATUS', 'ACCOUNT_STATUS', 'KYC_VERIFICATION', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "kycStatus" TEXT NOT NULL DEFAULT 'unverified',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletMember" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WalletRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "cachedBalanceCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "holderUserId" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "type" "CardType" NOT NULL DEFAULT 'VIRTUAL',
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "nickname" TEXT,
    "cardholderName" TEXT,
    "provider" "CardProvider" NOT NULL DEFAULT 'SYNCTERA',
    "providerCardId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "widgetTypes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "terminatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedReason" TEXT,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "walletId" TEXT,
    "cardId" TEXT,
    "userId" TEXT,
    "scope" "LedgerScope" NOT NULL,
    "cachedBalanceCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "kind" "LedgerEntryKind" NOT NULL DEFAULT 'OTHER',
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardAuthHold" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerName" "CardProvider" NOT NULL DEFAULT 'SYNCTERA',
    "providerAuthId" TEXT NOT NULL,
    "providerCardId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "status" "AuthHoldStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "CardAuthHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalTransfer" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "providerTransferId" TEXT,
    "status" "WithdrawalTransferStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" TEXT NOT NULL,
    "provider" "CardProvider" NOT NULL DEFAULT 'SYNCTERA',
    "eventType" "WebhookEventType" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UserVerification_userId_key" ON "UserVerification"("userId");

-- CreateIndex
CREATE INDEX "Wallet_adminUserId_idx" ON "Wallet"("adminUserId");

-- CreateIndex
CREATE INDEX "WalletMember_walletId_role_idx" ON "WalletMember"("walletId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "WalletMember_walletId_userId_key" ON "WalletMember"("walletId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_cardId_key" ON "Account"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_accountId_key" ON "Card"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_providerCardId_key" ON "Card"("providerCardId");

-- CreateIndex
CREATE INDEX "LedgerAccount_walletId_cardId_idx" ON "LedgerAccount"("walletId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_cardId_scope_userId_key" ON "LedgerAccount"("cardId", "scope", "userId");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "CardAuthHold_cardId_status_idx" ON "CardAuthHold"("cardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CardAuthHold_providerName_providerAuthId_key" ON "CardAuthHold"("providerName", "providerAuthId");

-- CreateIndex
CREATE INDEX "Withdrawal_walletId_status_idx" ON "Withdrawal"("walletId", "status");

-- CreateIndex
CREATE INDEX "Withdrawal_cardId_status_idx" ON "Withdrawal"("cardId", "status");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_status_idx" ON "Withdrawal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalTransfer_providerTransferId_key" ON "WithdrawalTransfer"("providerTransferId");

-- CreateIndex
CREATE INDEX "WithdrawalTransfer_withdrawalId_idx" ON "WithdrawalTransfer"("withdrawalId");

-- CreateIndex
CREATE INDEX "WithdrawalTransfer_status_idx" ON "WithdrawalTransfer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEventLog_provider_providerEventId_key" ON "WebhookEventLog"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "UserVerification" ADD CONSTRAINT "UserVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMember" ADD CONSTRAINT "WalletMember_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMember" ADD CONSTRAINT "WalletMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_holderUserId_fkey" FOREIGN KEY ("holderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAuthHold" ADD CONSTRAINT "CardAuthHold_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAuthHold" ADD CONSTRAINT "CardAuthHold_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAuthHold" ADD CONSTRAINT "CardAuthHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalTransfer" ADD CONSTRAINT "WithdrawalTransfer_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
