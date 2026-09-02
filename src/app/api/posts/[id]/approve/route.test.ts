import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { post: { update: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/posts/post-1/approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/posts/[id]/approve', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.update).mockReset();
  });

  test('returns 400 when scheduledAt is not a valid ISO datetime', async () => {
    const response = await POST(buildRequest({ scheduledAt: 'amanhã' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(response.status).toBe(400);
  });

  test('schedules the post at the given datetime', async () => {
    const response = await POST(buildRequest({ scheduledAt: '2026-09-05T12:00:00.000Z' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'scheduled', scheduledAt: new Date('2026-09-05T12:00:00.000Z') },
    });
    expect(response.status).toBe(200);
  });
});
