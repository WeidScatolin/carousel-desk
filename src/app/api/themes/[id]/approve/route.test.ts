import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { theme: { update: vi.fn() } } }));
vi.mock('@/lib/pipeline/generatePostFromTheme', () => ({ generatePostFromTheme: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { generatePostFromTheme } from '@/lib/pipeline/generatePostFromTheme';
import { POST } from './route';

function buildRequest(): Request {
  return new Request('http://localhost/api/themes/theme-1/approve', { method: 'POST' });
}

describe('POST /api/themes/[id]/approve', () => {
  beforeEach(() => {
    vi.mocked(prisma.theme.update).mockReset();
    vi.mocked(generatePostFromTheme).mockReset();
  });

  test('marks the theme approved and returns the generated post id', async () => {
    vi.mocked(generatePostFromTheme).mockResolvedValue('post-1');

    const response = await POST(buildRequest(), { params: Promise.resolve({ id: 'theme-1' }) });
    const body = await response.json();

    expect(prisma.theme.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: { status: 'approved' },
    });
    expect(generatePostFromTheme).toHaveBeenCalledWith('theme-1');
    expect(response.status).toBe(200);
    expect(body).toEqual({ postId: 'post-1' });
  });

  test('returns 500 when generation fails', async () => {
    vi.mocked(generatePostFromTheme).mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(buildRequest(), { params: Promise.resolve({ id: 'theme-1' }) });

    expect(response.status).toBe(500);
  });
});
