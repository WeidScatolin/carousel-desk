import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    commentDelivery: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/leads/deliverCommentReply', () => ({
  composeReplyMessage: vi.fn(() => 'Aqui está!'),
  deliverCommentReply: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { deliverCommentReply } from '@/lib/leads/deliverCommentReply';
import { POST } from './route';

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/comment-automations/deliveries/[id]/reprocess', () => {
  beforeEach(() => {
    vi.mocked(prisma.commentDelivery.updateMany).mockReset();
    vi.mocked(prisma.commentDelivery.findUniqueOrThrow).mockReset();
    vi.mocked(prisma.commentDelivery.update).mockReset();
    vi.mocked(deliverCommentReply).mockReset();
  });

  test('returns 409 when the delivery is not FAILED (claim loses)', async () => {
    vi.mocked(prisma.commentDelivery.updateMany).mockResolvedValue({ count: 0 });

    const response = await POST(new Request('http://localhost'), paramsFor('d1'));

    expect(response.status).toBe(409);
    expect(deliverCommentReply).not.toHaveBeenCalled();
  });

  test('reprocesses a FAILED delivery and records the new outcome', async () => {
    vi.mocked(prisma.commentDelivery.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.commentDelivery.findUniqueOrThrow).mockResolvedValue({
      id: 'd1',
      instagramCommentId: 'comment-1',
      automation: { replyMessage: 'Aqui está!', assetUrl: null },
    } as never);
    vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'SENT', externalMessageId: 'msg-1', lastError: null });
    vi.mocked(prisma.commentDelivery.update).mockResolvedValue({ id: 'd1', status: 'SENT' } as never);

    const response = await POST(new Request('http://localhost'), paramsFor('d1'));

    expect(response.status).toBe(200);
    expect(prisma.commentDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: {
        status: 'SENT',
        externalMessageId: 'msg-1',
        lastError: null,
        retryCount: { increment: 1 },
        deliveredAt: expect.any(Date),
      },
    });
  });

  test('keeps deliveredAt null when the reprocess attempt fails again', async () => {
    vi.mocked(prisma.commentDelivery.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.commentDelivery.findUniqueOrThrow).mockResolvedValue({
      id: 'd1',
      instagramCommentId: 'comment-1',
      automation: { replyMessage: 'Aqui está!', assetUrl: null },
    } as never);
    vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'FAILED', externalMessageId: null, lastError: 'still broken' });
    vi.mocked(prisma.commentDelivery.update).mockResolvedValue({ id: 'd1', status: 'FAILED' } as never);

    await POST(new Request('http://localhost'), paramsFor('d1'));

    expect(prisma.commentDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: null, status: 'FAILED' }) }),
    );
  });
});
