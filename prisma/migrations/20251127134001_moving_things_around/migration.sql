/*
  Warnings:

  - You are about to drop the column `syncteraPersonId` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "BaasProviderName" ADD VALUE 'SYNCTERA';

-- DropIndex
DROP INDEX "User_syncteraPersonId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "syncteraPersonId";
