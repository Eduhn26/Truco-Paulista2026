/*
  Warnings:

  - You are about to drop the column `playerToken` on the `PlayerProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `PlayerProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `PlayerProfile` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PlayerProfile_playerToken_key";

-- AlterTable
ALTER TABLE "PlayerProfile" DROP COLUMN "playerToken",
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_providerUserId_key" ON "User"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
