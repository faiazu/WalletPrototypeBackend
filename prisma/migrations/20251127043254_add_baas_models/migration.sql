-- CreateEnum
CREATE TYPE "BaasProviderName" AS ENUM ('MOCK', 'STRIPE_ISSUING', 'LITHIC', 'UNIT', 'OTHER');

-- CreateTable
CREATE TABLE "BaasCustomer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerName" "BaasProviderName" NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaasCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaasCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT,
    "providerName" "BaasProviderName" NOT NULL,
    "externalCardId" TEXT NOT NULL,
    "last4" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "baasCustomerId" TEXT,

    CONSTRAINT "BaasCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BaasCustomer_userId_key" ON "BaasCustomer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BaasCustomer_externalCustomerId_key" ON "BaasCustomer"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BaasCard_externalCardId_key" ON "BaasCard"("externalCardId");

-- AddForeignKey
ALTER TABLE "BaasCustomer" ADD CONSTRAINT "BaasCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasCard" ADD CONSTRAINT "BaasCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasCard" ADD CONSTRAINT "BaasCard_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasCard" ADD CONSTRAINT "BaasCard_baasCustomerId_fkey" FOREIGN KEY ("baasCustomerId") REFERENCES "BaasCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
