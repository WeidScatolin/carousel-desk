import { describe, test, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { commentDelivery: { findMany: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import { GET } from './route';

describe('GET /api/comment-automations/[id]/deliveries', () => {
  test('lists deliveries for the automation, newest discovered first', async () => {
    vi.mocked(prisma.commentDelivery.findMany).mockResolvedValue([{ id: 'd1' }] as never);

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'a1' }) });

    expect(response.status).toBe(200);
    expect(prisma.commentDelivery.findMany).toHaveBeenCalledWith({
      where: { automationId: 'a1' },
      orderBy: { discoveredAt: 'desc' },
    });
  });
});
