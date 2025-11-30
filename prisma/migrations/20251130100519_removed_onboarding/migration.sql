/*
  Warnings:

  - You are about to drop the `OnboardingSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OnboardingSession" DROP CONSTRAINT "OnboardingSession_userId_fkey";

-- DropTable
DROP TABLE "OnboardingSession";

-- DropEnum
DROP TYPE "OnboardingStatus";
