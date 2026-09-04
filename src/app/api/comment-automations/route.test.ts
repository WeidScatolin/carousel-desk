import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    commentAutomation: { findMany: vi.fn(), create: vi.fn() },
    post: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { GET, POST } from './route';

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/comment-automations', { method: 'POST', body: JSON.stringify(body) });
}

const validPayload = {
  postId: 'post-1',
  keyword: 'mapa',
  matchMode: 'CONTAINS_WORD' as const,
  replyMessage: 'Aqui está o mapa!',
  assetUrl: 'https://example.com/mapa.pdf',
};

describe('GET /api/comment-automations', () => {
  test('lists automations newest first', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([{ id: 'a1' }] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.commentAutomation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});

describe('POST /api/comment-automations', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.findUnique).mockReset();
    vi.mocked(prisma.commentAutomation.create).mockReset();
  });

  test('returns 400 for an invalid payload', async () => {
    const response = await POST(postRequest({ ...validPayload, keyword: '' }));
    expect(response.status).toBe(400);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
  });

  test('returns 404 when the post does not exist', async () => {
    vi.mocked(prisma.post.findUnique).mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(404);
  });

  test('returns 400 when the post is not published', async () => {
    vi.mocked(prisma.post.findUnique).mockResolvedValue({ id: 'post-1', status: 'scheduled', instagramPostId: null } as never);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(400);
    expect(prisma.commentAutomation.create).not.toHaveBeenCalled();
  });

  test('normalizes the keyword and uses the post instagramPostId as instagramMediaId', async () => {
    vi.mocked(prisma.post.findUnique).mockResolvedValue({ id: 'post-1', status: 'published', instagramPostId: 'ig-media-1' } as never);
    vi.mocked(prisma.commentAutomation.create).mockResolvedValue({ id: 'automation-1' } as never);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect(prisma.commentAutomation.create).toHaveBeenCalledWith({
      data: {
        postId: 'post-1',
        instagramMediaId: 'ig-media-1',
        keyword: 'mapa',
        normalizedKeyword: 'MAPA',
        matchMode: 'CONTAINS_WORD',
        replyMessage: 'Aqui está o mapa!',
        assetUrl: 'https://example.com/mapa.pdf',
      },
    });
  });

  test('returns 409 on a duplicate instagramMediaId+normalizedKeyword', async () => {
    vi.mocked(prisma.post.findUnique).mockResolvedValue({ id: 'post-1', status: 'published', instagramPostId: 'ig-media-1' } as never);
    const { Prisma } = await import('@/generated/prisma/client');
    vi.mocked(prisma.commentAutomation.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
    );

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(409);
  });
});
