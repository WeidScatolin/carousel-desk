import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
    theme: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/posts/post-1/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/posts/[id]/reject', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.update).mockReset();
    vi.mocked(prisma.post.findUniqueOrThrow).mockReset();
    vi.mocked(prisma.theme.update).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
  });

  test('returns 400 when reason is missing', async () => {
    const response = await POST(buildRequest({}), { params: Promise.resolve({ id: 'post-1' }) });

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('rejects the post and requeues its theme in a single transaction', async () => {
    vi.mocked(prisma.post.findUniqueOrThrow).mockResolvedValue({ themeId: 'theme-1' } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
      expect(Array.isArray(ops)).toBe(true);
      return ops;
    });
    vi.mocked(prisma.post.update).mockReturnValue({ themeId: 'theme-1' } as never);

    const response = await POST(buildRequest({ reason: 'texto fraco' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'rejected', rejectionReason: 'texto fraco' },
    });
    expect(prisma.theme.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: { status: 'pending' },
    });
    expect(response.status).toBe(200);
  });
});
