-- AlterTable
ALTER TABLE "BaasCard" ADD COLUMN     "baasAccountId" TEXT;

-- AlterTable
ALTER TABLE "BaasFundingRoute" ADD COLUMN     "baasAccountId" TEXT;

-- CreateTable
CREATE TABLE "BaasAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT,
    "baasCustomerId" TEXT,
    "providerName" "BaasProviderName" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accessStatus" TEXT,
    "accountNumberLast4" TEXT,
    "routingNumber" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaasAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BaasAccount_externalAccountId_key" ON "BaasAccount"("externalAccountId");

-- AddForeignKey
ALTER TABLE "BaasAccount" ADD CONSTRAINT "BaasAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasAccount" ADD CONSTRAINT "BaasAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasAccount" ADD CONSTRAINT "BaasAccount_baasCustomerId_fkey" FOREIGN KEY ("baasCustomerId") REFERENCES "BaasCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasCard" ADD CONSTRAINT "BaasCard_baasAccountId_fkey" FOREIGN KEY ("baasAccountId") REFERENCES "BaasAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasFundingRoute" ADD CONSTRAINT "BaasFundingRoute_baasAccountId_fkey" FOREIGN KEY ("baasAccountId") REFERENCES "BaasAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
