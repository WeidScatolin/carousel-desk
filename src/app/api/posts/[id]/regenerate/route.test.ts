import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    slide: { deleteMany: vi.fn() },
    brandStrategy: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/pipeline/regeneratePostSlides', () => ({ regeneratePostSlides: vi.fn() }));
vi.mock('@/lib/storage/cloudinary', () => ({ deleteSlideImage: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { regeneratePostSlides } from '@/lib/pipeline/regeneratePostSlides';
import { deleteSlideImage } from '@/lib/storage/cloudinary';
import { POST } from './route';

const readyPost = {
  id: 'post-1',
  status: 'pending_approval',
  slides: [{ id: 'slide-1', cloudinaryPublicId: 'old-public-id' }],
  theme: { id: 'theme-1', headlineSuggestion: 'Tema', contentBrief: { postGoal: 'follow', leadMagnet: null } },
};

function request(): Request {
  return new Request('http://localhost/api/posts/post-1/regenerate', { method: 'POST' });
}

describe('POST /api/posts/[id]/regenerate', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.findUniqueOrThrow).mockReset().mockResolvedValue(readyPost as never);
    vi.mocked(prisma.post.update).mockReset();
    vi.mocked(prisma.slide.deleteMany).mockReset();
    vi.mocked(prisma.brandStrategy.findFirst).mockReset().mockResolvedValue({ id: 'brand-1' } as never);
    vi.mocked(regeneratePostSlides).mockReset();
    vi.mocked(deleteSlideImage).mockReset();
  });

  test('refuses to regenerate a scheduled post', async () => {
    vi.mocked(prisma.post.findUniqueOrThrow).mockResolvedValue({ ...readyPost, status: 'scheduled' } as never);

    const response = await POST(request(), { params: Promise.resolve({ id: 'post-1' }) });

    expect(response.status).toBe(409);
    expect(regeneratePostSlides).not.toHaveBeenCalled();
  });

  test('refuses to regenerate a published post', async () => {
    vi.mocked(prisma.post.findUniqueOrThrow).mockResolvedValue({ ...readyPost, status: 'published' } as never);

    const response = await POST(request(), { params: Promise.resolve({ id: 'post-1' }) });

    expect(response.status).toBe(409);
  });

  test('deletes old slide images, clears old slides, and calls regeneratePostSlides', async () => {
    vi.mocked(regeneratePostSlides).mockResolvedValue({ caption: 'Nova legenda', ctaKeyword: null });
    vi.mocked(prisma.post.update).mockResolvedValue({ id: 'post-1' } as never);

    const response = await POST(request(), { params: Promise.resolve({ id: 'post-1' }) });

    expect(deleteSlideImage).toHaveBeenCalledWith('old-public-id');
    expect(prisma.slide.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } });
    expect(regeneratePostSlides).toHaveBeenCalledWith('post-1', readyPost.theme, readyPost.theme.contentBrief, { id: 'brand-1' });
    expect(response.status).toBe(200);
  });

  test('marks the post as error and returns 500 when regeneration fails, without throwing', async () => {
    vi.mocked(regeneratePostSlides).mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request(), { params: Promise.resolve({ id: 'post-1' }) });

    expect(response.status).toBe(500);
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'error', errorMessage: 'provider unavailable' },
    });
  });
});
