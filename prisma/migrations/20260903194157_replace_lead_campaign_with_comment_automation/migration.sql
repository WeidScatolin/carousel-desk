/*
  Warnings:

  - You are about to drop the `CommentLeadEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeadMagnetCampaign` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "KeywordMatchMode" AS ENUM ('EXACT', 'CONTAINS_WORD');

-- CreateEnum
CREATE TYPE "CommentDeliveryStatus" AS ENUM ('DISCOVERED', 'IGNORED', 'MATCHED', 'PROCESSING', 'SIMULATED', 'SENT', 'FAILED');

-- DropForeignKey
ALTER TABLE "CommentLeadEvent" DROP CONSTRAINT "CommentLeadEvent_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "LeadMagnetCampaign" DROP CONSTRAINT "LeadMagnetCampaign_carouselId_fkey";

-- DropForeignKey
ALTER TABLE "LeadMagnetCampaign" DROP CONSTRAINT "LeadMagnetCampaign_leadMagnetId_fkey";

-- DropTable
DROP TABLE "CommentLeadEvent";

-- DropTable
DROP TABLE "LeadMagnetCampaign";

-- DropEnum
DROP TYPE "CampaignStatus";

-- DropEnum
DROP TYPE "DeliveryStatus";

-- DropEnum
DROP TYPE "LeadStage";

-- DropEnum
DROP TYPE "MatchMode";

-- CreateTable
CREATE TABLE "CommentAutomation" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "instagramMediaId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "matchMode" "KeywordMatchMode" NOT NULL DEFAULT 'CONTAINS_WORD',
    "replyMessage" TEXT NOT NULL,
    "assetUrl" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentDelivery" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "instagramCommentId" TEXT NOT NULL,
    "instagramMediaId" TEXT NOT NULL,
    "instagramUsername" TEXT,
    "originalComment" TEXT NOT NULL,
    "normalizedComment" TEXT NOT NULL,
    "status" "CommentDeliveryStatus" NOT NULL DEFAULT 'DISCOVERED',
    "externalMessageId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommentAutomation_instagramMediaId_normalizedKeyword_key" ON "CommentAutomation"("instagramMediaId", "normalizedKeyword");

-- CreateIndex
CREATE UNIQUE INDEX "CommentDelivery_instagramCommentId_key" ON "CommentDelivery"("instagramCommentId");

-- AddForeignKey
ALTER TABLE "CommentAutomation" ADD CONSTRAINT "CommentAutomation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentDelivery" ADD CONSTRAINT "CommentDelivery_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "CommentAutomation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
