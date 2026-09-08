ALTER TABLE "Post"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "generationComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expectedSlideCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "errorStage" TEXT,
  ADD COLUMN "instagramContainerId" TEXT,
  ADD COLUMN "publicationAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "autopilotSlot" TEXT;
CREATE UNIQUE INDEX "Post_autopilotSlot_key" ON "Post"("autopilotSlot");
ALTER TABLE "Slide" ADD COLUMN "renderVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommentDelivery" ADD COLUMN "nextRetryAt" TIMESTAMP(3);

UPDATE "Post" p SET "generationComplete" = true,
  "expectedSlideCount" = (SELECT COUNT(*) FROM "Slide" s WHERE s."postId" = p.id)
WHERE p.caption IS NOT NULL AND EXISTS (SELECT 1 FROM "Slide" s WHERE s."postId" = p.id);
UPDATE "Post" p SET status = 'generating'
WHERE status = 'pending_approval' AND "generationComplete" = true
  AND EXISTS (SELECT 1 FROM "Slide" s WHERE s."postId" = p.id AND s."imageUrl" IS NULL);

CREATE TABLE "AutomationSettings" (
  id TEXT NOT NULL DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT false,
  "dailyPostLimit" INTEGER NOT NULL DEFAULT 1,
  "publishHourUtc" INTEGER NOT NULL DEFAULT 12,
  "minThemeScore" INTEGER NOT NULL DEFAULT 70,
  "autoCommentReplies" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSettings_pkey" PRIMARY KEY (id),
  CONSTRAINT "AutomationSettings_limits" CHECK ("dailyPostLimit" BETWEEN 1 AND 3 AND "publishHourUtc" BETWEEN 0 AND 23 AND "minThemeScore" BETWEEN 0 AND 100)
);
INSERT INTO "AutomationSettings" (id, "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
CREATE TABLE "PipelineState" (
  stage TEXT NOT NULL,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastStartedAt" TIMESTAMP(3),
  "lastFinishedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastError" TEXT,
  counts JSONB,
  CONSTRAINT "PipelineState_pkey" PRIMARY KEY (stage)
);
CREATE INDEX "Post_work_queue_idx" ON "Post"(status, "scheduledAt", "nextRetryAt");

ALTER TYPE "CommentDeliveryStatus" ADD VALUE 'UNCERTAIN';
ALTER TABLE "CommentDelivery" ADD COLUMN "commentedAt" TIMESTAMP(3);
ALTER TABLE "CommentAutomation" ADD COLUMN "lastPolledAt" TIMESTAMP(3), ADD COLUMN "commentsCursor" TEXT;
UPDATE "Post" SET "processingStartedAt" = CURRENT_TIMESTAMP WHERE status = 'generating';
-- Legacy failures after an attempted publication cannot safely be retried.
UPDATE "Post" SET "errorStage" = 'publish_uncertain', "publicationAttemptedAt" = CURRENT_TIMESTAMP
WHERE status = 'publishing';
