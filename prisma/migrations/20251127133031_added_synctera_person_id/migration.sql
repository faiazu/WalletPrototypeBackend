/*
  Warnings:

  - A unique constraint covering the columns `[syncteraPersonId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "syncteraPersonId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_syncteraPersonId_key" ON "User"("syncteraPersonId");
