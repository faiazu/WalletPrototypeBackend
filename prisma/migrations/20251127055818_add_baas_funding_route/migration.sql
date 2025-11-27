-- CreateTable
CREATE TABLE "BaasFundingRoute" (
    "id" TEXT NOT NULL,
    "providerName" "BaasProviderName" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaasFundingRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BaasFundingRoute_providerName_providerAccountId_reference_key" ON "BaasFundingRoute"("providerName", "providerAccountId", "reference");

-- AddForeignKey
ALTER TABLE "BaasFundingRoute" ADD CONSTRAINT "BaasFundingRoute_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaasFundingRoute" ADD CONSTRAINT "BaasFundingRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
