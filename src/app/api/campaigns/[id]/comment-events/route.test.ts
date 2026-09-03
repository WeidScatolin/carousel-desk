import { describe, test, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { commentLeadEvent: { findMany: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { GET } from './route';

describe('GET /api/campaigns/[id]/comment-events', () => {
  test('lists comment events for the campaign, newest first', async () => {
    vi.mocked(prisma.commentLeadEvent.findMany).mockResolvedValue([{ id: 'event-1' }] as never);

    const response = await GET(new Request('http://localhost/api/campaigns/campaign-1/comment-events'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    });

    expect(prisma.commentLeadEvent.findMany).toHaveBeenCalledWith({
      where: { campaignId: 'campaign-1' },
      orderBy: { receivedAt: 'desc' },
    });
    expect(response.status).toBe(200);
  });
});
