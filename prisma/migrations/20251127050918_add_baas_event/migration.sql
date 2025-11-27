-- CreateTable
CREATE TABLE "BaasEvent" (
    "id" TEXT NOT NULL,
    "providerName" "BaasProviderName" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaasEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BaasEvent_providerName_providerEventId_key" ON "BaasEvent"("providerName", "providerEventId");
