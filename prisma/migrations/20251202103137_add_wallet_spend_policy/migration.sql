-- CreateEnum
CREATE TYPE "WalletSpendPolicy" AS ENUM ('PAYER_ONLY', 'EQUAL_SPLIT');

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "spendPolicy" "WalletSpendPolicy" NOT NULL DEFAULT 'PAYER_ONLY';
