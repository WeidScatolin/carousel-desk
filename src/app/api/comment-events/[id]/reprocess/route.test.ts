import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { commentLeadEvent: { findUniqueOrThrow: vi.fn() } },
}));
vi.mock('@/lib/pipeline/processCommentEvent', () => ({ processCommentEvent: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { processCommentEvent } from '@/lib/pipeline/processCommentEvent';
import { POST } from './route';

const failedEvent = {
  id: 'event-1',
  instagramCommentId: 'comment-1',
  instagramMediaId: 'media-1',
  instagramUserId: 'user-1',
  instagramUsername: 'fulano',
  originalComment: 'Quero o MAPA',
  deliveryStatus: 'FAILED',
};

describe('POST /api/comment-events/[id]/reprocess', () => {
  beforeEach(() => {
    vi.mocked(prisma.commentLeadEvent.findUniqueOrThrow).mockReset();
    vi.mocked(processCommentEvent).mockReset();
  });

  test('reprocesses a FAILED event with its original stored fields', async () => {
    vi.mocked(prisma.commentLeadEvent.findUniqueOrThrow).mockResolvedValue(failedEvent as never);
    vi.mocked(processCommentEvent).mockResolvedValue({ id: 'event-1', deliveryStatus: 'SENT' } as never);

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'event-1' }),
    });

    expect(processCommentEvent).toHaveBeenCalledWith({
      instagramCommentId: 'comment-1',
      instagramMediaId: 'media-1',
      instagramUserId: 'user-1',
      instagramUsername: 'fulano',
      originalComment: 'Quero o MAPA',
    });
    expect(response.status).toBe(200);
  });

  test('refuses to reprocess an event that is not FAILED', async () => {
    vi.mocked(prisma.commentLeadEvent.findUniqueOrThrow).mockResolvedValue({
      ...failedEvent,
      deliveryStatus: 'SENT',
    } as never);

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'event-1' }),
    });

    expect(response.status).toBe(409);
    expect(processCommentEvent).not.toHaveBeenCalled();
  });
});
