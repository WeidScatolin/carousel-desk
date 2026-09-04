import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { slide: { findMany: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import { GET } from './route';

function authorizedRequest(): Request {
  return new Request('http://localhost/api/pipeline/pending-slides', {
    headers: { Authorization: 'Bearer publish-secret' },
  });
}

describe('GET /api/pipeline/pending-slides', () => {
  beforeEach(() => {
    process.env.PUBLISH_API_TOKEN = 'publish-secret';
    vi.mocked(prisma.slide.findMany).mockReset();
  });

  test('returns 401 without a valid bearer token', async () => {
    const response = await GET(new Request('http://localhost', { headers: { Authorization: 'Bearer wrong' } }));
    expect(response.status).toBe(401);
    expect(prisma.slide.findMany).not.toHaveBeenCalled();
  });

  test('lists slides with no rendered image yet, on posts still generating', async () => {
    vi.mocked(prisma.slide.findMany).mockResolvedValue([{ id: 's1', postId: 'p1', htmlContent: '<html></html>' }] as never);

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(prisma.slide.findMany).toHaveBeenCalledWith({
      where: { imageUrl: null, post: { status: 'generating' } },
      select: { id: true, postId: true, htmlContent: true },
      orderBy: { order: 'asc' },
    });
    await expect(response.json()).resolves.toEqual({ slides: [{ id: 's1', postId: 'p1', htmlContent: '<html></html>' }] });
  });
});
