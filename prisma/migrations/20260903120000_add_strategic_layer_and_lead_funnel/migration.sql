-- CreateEnum
CREATE TYPE "ContentPillar" AS ENUM ('radar', 'blueprint', 'diagnostic', 'proof');
CREATE TYPE "FunnelStage" AS ENUM ('awareness', 'consideration', 'conversion');
CREATE TYPE "PostGoal" AS ENUM ('follow', 'save_share', 'comment_dm', 'offer');
CREATE TYPE "SlideRole" AS ENUM ('cover', 'problem', 'consequence', 'mechanism', 'example', 'list_item', 'evidence', 'risk', 'framework', 'bridge', 'cta');
CREATE TYPE "SlideVisualType" AS ENUM ('main_image', 'diagram', 'mockup', 'screenshot', 'data', 'typography_only');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'FINISHED');
CREATE TYPE "MatchMode" AS ENUM ('EXACT', 'CONTAINS_WORD');
CREATE TYPE "DeliveryStatus" AS ENUM ('RECEIVED', 'IGNORED', 'PENDING', 'SENT', 'FAILED');
CREATE TYPE "LeadStage" AS ENUM ('COMMENTED', 'MATERIAL_SENT', 'RESPONDED', 'QUALIFIED', 'OPPORTUNITY', 'CUSTOMER');

-- AlterEnum (additive only — existing 'cover'/'evidence'/'framework' rows keep working)
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'cover_cinematic';
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'editorial_text';
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'list_item';
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'chat_demo';
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'case_study';
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'risk';
ALTER TYPE "SlideTemplate" ADD VALUE IF NOT EXISTS 'cta';

-- AlterTable: Theme (Fase 2 — enriquecimento)
ALTER TABLE "Theme"
  ADD COLUMN "articleBody" TEXT,
  ADD COLUMN "articleFacts" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "articleAuthor" TEXT,
  ADD COLUMN "articlePublishedAt" TIMESTAMP(3),
  ADD COLUMN "hasSufficientEvidence" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: BrandStrategy
CREATE TABLE "BrandStrategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "positioning" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "coreProblem" TEXT NOT NULL,
    "promise" TEXT NOT NULL,
    "offerDescription" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "defaultCtaKeyword" TEXT NOT NULL,
    "instagramHandle" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LeadMagnet
CREATE TABLE "LeadMagnet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deliveryUrl" TEXT NOT NULL,
    "ctaKeyword" TEXT NOT NULL,
    "qualificationQuestion" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMagnet_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Post (Fase 4/6 — copy dinâmica, legenda, funil)
ALTER TABLE "Post"
  ADD COLUMN "caption" TEXT,
  ADD COLUMN "ctaKeyword" TEXT,
  ADD COLUMN "postGoal" "PostGoal",
  ADD COLUMN "contentPillar" "ContentPillar",
  ADD COLUMN "funnelStage" "FunnelStage",
  ADD COLUMN "leadMagnetId" TEXT;

ALTER TABLE "Post" ADD CONSTRAINT "Post_leadMagnetId_fkey"
  FOREIGN KEY ("leadMagnetId") REFERENCES "LeadMagnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Slide (Fase 5 — identidade visual / contrato dinâmico)
ALTER TABLE "Slide"
  ADD COLUMN "role" "SlideRole",
  ADD COLUMN "accentPhrase" TEXT,
  ADD COLUMN "kicker" TEXT,
  ADD COLUMN "sourceLabel" TEXT,
  ADD COLUMN "visualType" "SlideVisualType",
  ADD COLUMN "visualInstructions" TEXT;

-- CreateTable: ContentBrief
CREATE TABLE "ContentBrief" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "postId" TEXT,
    "contentPillar" "ContentPillar" NOT NULL,
    "funnelStage" "FunnelStage" NOT NULL,
    "postGoal" "PostGoal" NOT NULL,
    "targetPain" TEXT NOT NULL,
    "businessApplication" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "hookVariants" TEXT[] NOT NULL DEFAULT '{}',
    "angle" TEXT NOT NULL,
    "strategicRationale" TEXT NOT NULL,
    "leadMagnetId" TEXT,
    "audienceFitScore" INTEGER NOT NULL,
    "businessImpactScore" INTEGER NOT NULL,
    "hookPotentialScore" INTEGER NOT NULL,
    "evidenceQualityScore" INTEGER NOT NULL,
    "offerBridgeScore" INTEGER NOT NULL,
    "noveltyScore" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentBrief_themeId_key" ON "ContentBrief"("themeId");
CREATE UNIQUE INDEX "ContentBrief_postId_key" ON "ContentBrief"("postId");

ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_themeId_fkey"
  FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_leadMagnetId_fkey"
  FOREIGN KEY ("leadMagnetId") REFERENCES "LeadMagnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: LeadMagnetCampaign
CREATE TABLE "LeadMagnetCampaign" (
    "id" TEXT NOT NULL,
    "carouselId" TEXT NOT NULL,
    "instagramMediaId" TEXT,
    "leadMagnetId" TEXT,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchMode" "MatchMode" NOT NULL DEFAULT 'CONTAINS_WORD',
    "assetName" TEXT NOT NULL,
    "assetUrl" TEXT NOT NULL,
    "deliveryMessage" TEXT NOT NULL,
    "qualificationQuestion" TEXT,
    "publicReplyTemplate" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalComments" INTEGER NOT NULL DEFAULT 0,
    "matchedComments" INTEGER NOT NULL DEFAULT 0,
    "privateRepliesSent" INTEGER NOT NULL DEFAULT 0,
    "privateRepliesFailed" INTEGER NOT NULL DEFAULT 0,
    "qualifiedLeads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadMagnetCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadMagnetCampaign_carouselId_key" ON "LeadMagnetCampaign"("carouselId");
CREATE UNIQUE INDEX "LeadMagnetCampaign_instagramMediaId_key" ON "LeadMagnetCampaign"("instagramMediaId");

ALTER TABLE "LeadMagnetCampaign" ADD CONSTRAINT "LeadMagnetCampaign_carouselId_fkey"
  FOREIGN KEY ("carouselId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadMagnetCampaign" ADD CONSTRAINT "LeadMagnetCampaign_leadMagnetId_fkey"
  FOREIGN KEY ("leadMagnetId") REFERENCES "LeadMagnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: CommentLeadEvent
CREATE TABLE "CommentLeadEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "instagramCommentId" TEXT NOT NULL,
    "instagramMediaId" TEXT NOT NULL,
    "instagramUserId" TEXT,
    "instagramUsername" TEXT,
    "originalComment" TEXT NOT NULL,
    "normalizedComment" TEXT NOT NULL,
    "keywordMatched" BOOLEAN NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "leadStage" "LeadStage" NOT NULL DEFAULT 'COMMENTED',
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "ignoredReason" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentLeadEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentLeadEvent_instagramCommentId_key" ON "CommentLeadEvent"("instagramCommentId");

ALTER TABLE "CommentLeadEvent" ADD CONSTRAINT "CommentLeadEvent_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "LeadMagnetCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
