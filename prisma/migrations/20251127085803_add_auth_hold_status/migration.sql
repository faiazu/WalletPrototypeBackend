-- CreateEnum
CREATE TYPE "AuthHoldStatus" AS ENUM ('PENDING', 'CLEARED', 'REVERSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CardAuthHold" (
    "id" TEXT NOT NULL,
    "providerName" "BaasProviderName" NOT NULL,
    "providerAuthId" TEXT NOT NULL,
    "providerCardId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "AuthHoldStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "CardAuthHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardAuthHold_providerName_providerAuthId_key" ON "CardAuthHold"("providerName", "providerAuthId");

-- AddForeignKey
ALTER TABLE "CardAuthHold" ADD CONSTRAINT "CardAuthHold_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAuthHold" ADD CONSTRAINT "CardAuthHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
