import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { post: { update: vi.fn(), findUniqueOrThrow: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/posts/post-1/approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const readyPost = {
  id: 'post-1',
  caption: 'Legenda pronta',
  postGoal: 'follow',
  ctaKeyword: null,
  slides: [{ role: 'cover', sourceLabel: null, imageUrl: 'https://cdn.test/1.png' }],
};

describe('POST /api/posts/[id]/approve', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.update).mockReset();
    vi.mocked(prisma.post.findUniqueOrThrow).mockReset();
    vi.mocked(prisma.post.findUniqueOrThrow).mockResolvedValue(readyPost as never);
  });

  test('returns 400 when scheduledAt is not a valid ISO datetime', async () => {
    const response = await POST(buildRequest({ scheduledAt: 'amanhã' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(response.status).toBe(400);
    expect(prisma.post.findUniqueOrThrow).not.toHaveBeenCalled();
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

  test('returns 422 with blockers and does not schedule when the post is not ready', async () => {
    vi.mocked(prisma.post.findUniqueOrThrow).mockResolvedValue({
      ...readyPost,
      caption: null,
    } as never);

    const response = await POST(buildRequest({ scheduledAt: '2026-09-05T12:00:00.000Z' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.blockers).toContain('O post não tem legenda.');
    expect(prisma.post.update).not.toHaveBeenCalled();
  });
});
