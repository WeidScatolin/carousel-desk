import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    commentLeadEvent: { findUnique: vi.fn(), upsert: vi.fn() },
    leadMagnetCampaign: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('../leads/privateReplyProvider', () => ({ getPrivateReplyProvider: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { getPrivateReplyProvider } from '../leads/privateReplyProvider';
import { processCommentEvent } from './processCommentEvent';

const baseInput = {
  instagramCommentId: 'comment-1',
  instagramMediaId: 'media-1',
  instagramUserId: 'user-1',
  instagramUsername: 'fulano',
  originalComment: 'Quero o MAPA',
};

const activeCampaign = {
  id: 'campaign-1',
  keyword: 'MAPA',
  matchMode: 'CONTAINS_WORD' as const,
  status: 'ACTIVE' as const,
  deliveryMessage: 'Aqui está o mapa.',
  qualificationQuestion: 'Qual área consome mais tempo?',
};

function mockSendPrivateReply(result: { success: boolean; error?: string }): void {
  vi.mocked(getPrivateReplyProvider).mockReturnValue({
    sendPrivateReply: vi.fn().mockResolvedValue(result),
  });
}

describe('processCommentEvent', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(prisma.commentLeadEvent.findUnique).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.commentLeadEvent.upsert)
      .mockReset()
      .mockImplementation(((args: { create: unknown }) => Promise.resolve(args.create)) as never);
    vi.mocked(prisma.leadMagnetCampaign.findFirst).mockReset().mockResolvedValue(activeCampaign as never);
    vi.mocked(prisma.leadMagnetCampaign.update).mockReset();
    vi.mocked(getPrivateReplyProvider).mockReset();
    mockSendPrivateReply({ success: true });
  });

  test('returns the existing event unchanged when it is already SENT (idempotent)', async () => {
    const existing = { id: 'event-1', deliveryStatus: 'SENT' };
    vi.mocked(prisma.commentLeadEvent.findUnique).mockResolvedValue(existing as never);

    const result = await processCommentEvent(baseInput);

    expect(result).toBe(existing);
    expect(prisma.leadMagnetCampaign.findFirst).not.toHaveBeenCalled();
    expect(getPrivateReplyProvider).not.toHaveBeenCalled();
  });

  test('reprocesses a FAILED event instead of skipping it', async () => {
    const existing = { id: 'event-1', deliveryStatus: 'FAILED' };
    vi.mocked(prisma.commentLeadEvent.findUnique).mockResolvedValue(existing as never);
    mockSendPrivateReply({ success: true });

    await processCommentEvent(baseInput);

    expect(getPrivateReplyProvider).toHaveBeenCalled();
  });

  test('returns null when there is no ACTIVE campaign for the media', async () => {
    vi.mocked(prisma.leadMagnetCampaign.findFirst).mockResolvedValue(null);

    const result = await processCommentEvent(baseInput);

    expect(result).toBeNull();
    expect(getPrivateReplyProvider).not.toHaveBeenCalled();
  });

  test('queries only for an ACTIVE campaign, ignoring DRAFT/PAUSED/FINISHED ones', async () => {
    await processCommentEvent(baseInput);

    expect(prisma.leadMagnetCampaign.findFirst).toHaveBeenCalledWith({
      where: { instagramMediaId: 'media-1', status: 'ACTIVE' },
    });
  });

  test('ignores a comment from the business account itself', async () => {
    vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', 'user-1');

    const result = await processCommentEvent(baseInput);

    expect(result).toMatchObject({ deliveryStatus: 'IGNORED', ignoredReason: 'own profile comment' });
    expect(getPrivateReplyProvider).not.toHaveBeenCalled();
  });

  test('ignores a comment that does not match the campaign keyword and increments totalComments only', async () => {
    const result = await processCommentEvent({ ...baseInput, originalComment: 'sem a palavra certa' });

    expect(result).toMatchObject({ deliveryStatus: 'IGNORED', ignoredReason: 'keyword not matched', keywordMatched: false });
    expect(prisma.leadMagnetCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { totalComments: { increment: 1 } },
    });
    expect(getPrivateReplyProvider).not.toHaveBeenCalled();
  });

  test('respects the word-boundary matching rule via matchesKeyword integration', async () => {
    const result = await processCommentEvent({ ...baseInput, originalComment: 'MAPAS por todo lado' });

    expect(result).toMatchObject({ deliveryStatus: 'IGNORED', keywordMatched: false });
  });

  test('on a match, sends the deliveryMessage plus qualificationQuestion and increments matchedComments', async () => {
    mockSendPrivateReply({ success: true });

    await processCommentEvent(baseInput);

    expect(prisma.leadMagnetCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { totalComments: { increment: 1 }, matchedComments: { increment: 1 } },
    });
    const provider = vi.mocked(getPrivateReplyProvider).mock.results[0]?.value;
    expect(provider.sendPrivateReply).toHaveBeenCalledWith({
      commentId: 'comment-1',
      message: 'Aqui está o mapa.\n\nQual área consome mais tempo?',
    });
  });

  test('marks the event SENT with simulated=true when the feature flag is off (mock provider)', async () => {
    mockSendPrivateReply({ success: true });

    const result = await processCommentEvent(baseInput);

    expect(result).toMatchObject({ deliveryStatus: 'SENT', simulated: true, leadStage: 'MATERIAL_SENT' });
    expect(prisma.leadMagnetCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { privateRepliesSent: { increment: 1 } },
    });
  });

  test('marks the event SENT with simulated=false when the feature flag is on', async () => {
    vi.stubEnv('INSTAGRAM_PRIVATE_REPLIES_ENABLED', 'true');
    mockSendPrivateReply({ success: true });

    const result = await processCommentEvent(baseInput);

    expect(result).toMatchObject({ simulated: false });
  });

  test('marks the event FAILED (not thrown) when the provider returns success:false', async () => {
    mockSendPrivateReply({ success: false, error: 'rate limited' });

    const result = await processCommentEvent(baseInput);

    expect(result).toMatchObject({ deliveryStatus: 'FAILED', errorMessage: 'rate limited' });
    expect(prisma.leadMagnetCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { privateRepliesFailed: { increment: 1 } },
    });
  });
});
