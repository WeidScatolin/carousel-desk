import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { post: { update: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { PATCH } from './route';

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/posts/post-1', { method: 'PATCH', body: JSON.stringify(body) });
}

describe('PATCH /api/posts/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.update).mockReset();
  });

  test('returns 400 for an invalid payload', async () => {
    const response = await PATCH(patchRequest({ caption: '' }), { params: Promise.resolve({ id: 'post-1' }) });

    expect(response.status).toBe(400);
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  test('updates only the given fields, uppercasing ctaKeyword', async () => {
    vi.mocked(prisma.post.update).mockResolvedValue({ id: 'post-1' } as never);

    const response = await PATCH(patchRequest({ caption: 'Nova legenda', ctaKeyword: 'mapa' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { caption: 'Nova legenda', ctaKeyword: 'MAPA' },
    });
    expect(response.status).toBe(200);
  });

  test('allows clearing ctaKeyword and leadMagnetId with null', async () => {
    vi.mocked(prisma.post.update).mockResolvedValue({ id: 'post-1' } as never);

    await PATCH(patchRequest({ ctaKeyword: null, leadMagnetId: null }), { params: Promise.resolve({ id: 'post-1' }) });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { ctaKeyword: null, leadMagnetId: null },
    });
  });
});
