import { prisma } from '@/lib/prisma';
import type { CommentLeadEvent } from '@/generated/prisma/client';
import { matchesKeyword } from '../leads/matchKeyword';
import { normalizeKeyword } from '../leads/normalizeKeyword';
import { getPrivateReplyProvider } from '../leads/privateReplyProvider';

export interface ProcessCommentEventInput {
  instagramCommentId: string;
  instagramMediaId: string;
  instagramUserId?: string;
  instagramUsername?: string;
  originalComment: string;
}

function isOwnProfileComment(instagramUserId: string | undefined): boolean {
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  return Boolean(businessAccountId) && instagramUserId === businessAccountId;
}

// Returns null when there is no ACTIVE campaign for this media — since
// CommentLeadEvent.campaignId is a required foreign key, there is no
// valid row to persist in that case. The webhook route still
// acknowledges the delivery with 200; the comment just leaves no trace.
export async function processCommentEvent(input: ProcessCommentEventInput): Promise<CommentLeadEvent | null> {
  const existing = await prisma.commentLeadEvent.findUnique({
    where: { instagramCommentId: input.instagramCommentId },
  });
  if (existing && existing.deliveryStatus === 'SENT') {
    return existing;
  }
  const isFirstTimeSeen = !existing;

  const campaign = await prisma.leadMagnetCampaign.findFirst({
    where: { instagramMediaId: input.instagramMediaId, status: 'ACTIVE' },
  });
  if (!campaign) {
    return null;
  }

  const normalizedComment = normalizeKeyword(input.originalComment);
  const upsertWhere = { instagramCommentId: input.instagramCommentId };
  const commonFields = {
    campaignId: campaign.id,
    instagramMediaId: input.instagramMediaId,
    instagramUserId: input.instagramUserId ?? null,
    instagramUsername: input.instagramUsername ?? null,
    originalComment: input.originalComment,
    normalizedComment,
  };

  if (isOwnProfileComment(input.instagramUserId)) {
    return prisma.commentLeadEvent.upsert({
      where: upsertWhere,
      create: {
        ...commonFields,
        instagramCommentId: input.instagramCommentId,
        keywordMatched: false,
        deliveryStatus: 'IGNORED',
        ignoredReason: 'own profile comment',
      },
      update: { deliveryStatus: 'IGNORED', ignoredReason: 'own profile comment', keywordMatched: false },
    });
  }

  const matched = matchesKeyword(input.originalComment, campaign.keyword, campaign.matchMode);

  if (isFirstTimeSeen) {
    await prisma.leadMagnetCampaign.update({
      where: { id: campaign.id },
      data: matched
        ? { totalComments: { increment: 1 }, matchedComments: { increment: 1 } }
        : { totalComments: { increment: 1 } },
    });
  }

  if (!matched) {
    return prisma.commentLeadEvent.upsert({
      where: upsertWhere,
      create: {
        ...commonFields,
        instagramCommentId: input.instagramCommentId,
        keywordMatched: false,
        deliveryStatus: 'IGNORED',
        ignoredReason: 'keyword not matched',
      },
      update: { deliveryStatus: 'IGNORED', ignoredReason: 'keyword not matched', keywordMatched: false },
    });
  }

  const message = campaign.qualificationQuestion
    ? `${campaign.deliveryMessage}\n\n${campaign.qualificationQuestion}`
    : campaign.deliveryMessage;

  // Mirrors getPrivateReplyProvider's own flag check rather than
  // inspecting the returned instance, since constructor-name checks are
  // fragile under bundler minification.
  const isSimulated = process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED !== 'true';
  const reply = await getPrivateReplyProvider().sendPrivateReply({
    commentId: input.instagramCommentId,
    message,
  });

  if (reply.success) {
    await prisma.leadMagnetCampaign.update({
      where: { id: campaign.id },
      data: { privateRepliesSent: { increment: 1 } },
    });
    return prisma.commentLeadEvent.upsert({
      where: upsertWhere,
      create: {
        ...commonFields,
        instagramCommentId: input.instagramCommentId,
        keywordMatched: true,
        deliveryStatus: 'SENT',
        leadStage: 'MATERIAL_SENT',
        simulated: isSimulated,
        deliveredAt: new Date(),
      },
      update: {
        deliveryStatus: 'SENT',
        leadStage: 'MATERIAL_SENT',
        simulated: isSimulated,
        deliveredAt: new Date(),
        keywordMatched: true,
        errorMessage: null,
      },
    });
  }

  await prisma.leadMagnetCampaign.update({
    where: { id: campaign.id },
    data: { privateRepliesFailed: { increment: 1 } },
  });
  return prisma.commentLeadEvent.upsert({
    where: upsertWhere,
    create: {
      ...commonFields,
      instagramCommentId: input.instagramCommentId,
      keywordMatched: true,
      deliveryStatus: 'FAILED',
      errorMessage: reply.error ?? 'Unknown error sending the private reply',
      retryCount: 1,
    },
    update: {
      deliveryStatus: 'FAILED',
      errorMessage: reply.error ?? 'Unknown error sending the private reply',
      keywordMatched: true,
      retryCount: { increment: 1 },
    },
  });
}
