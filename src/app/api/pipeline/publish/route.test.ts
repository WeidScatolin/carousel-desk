import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/instagram/publishCarousel', () => ({ publishCarousel: vi.fn() }));
vi.mock('@/lib/storage/cloudinary', () => ({ deleteSlideImage: vi.fn() }));

import { publishCarousel } from '@/lib/instagram/publishCarousel';
import { prisma } from '@/lib/prisma';
import { deleteSlideImage } from '@/lib/storage/cloudinary';
import { POST } from './route';

describe('POST /api/pipeline/publish', () => {
  const themeIds: string[] = [];

  beforeEach(() => {
    process.env.PUBLISH_API_TOKEN = 'publish-secret';
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = 'ig-business-1';
    vi.mocked(publishCarousel).mockReset();
    vi.mocked(deleteSlideImage).mockReset();
    vi.mocked(deleteSlideImage).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId: { in: themeIds } } } });
    await prisma.post.deleteMany({ where: { themeId: { in: themeIds } } });
    await prisma.theme.deleteMany({ where: { id: { in: themeIds } } });
    themeIds.splice(0, themeIds.length);
    delete process.env.PUBLISH_API_TOKEN;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  });

  async function createScheduledPost(scheduledAt: Date = new Date(Date.now() - 60_000)) {
    const theme = await prisma.theme.create({
      data: {
        sourceUrl: `https://example.com/${crypto.randomUUID()}`,
        summary: 'Resumo de teste',
        headlineSuggestion: 'Tema de teste',
        status: 'approved',
      },
    });
    themeIds.push(theme.id);
    return prisma.post.create({
      data: {
        themeId: theme.id,
        status: 'scheduled',
        scheduledAt,
        slides: {
          create: [
            { order: 1, template: 'evidence', htmlContent: '<html>slide 2</html>', imageUrl: 'https://cdn.test/slide-2.png', cloudinaryPublicId: 'slide-2' },
            { order: 0, template: 'cover', htmlContent: '<html>slide 1</html>', imageUrl: 'https://cdn.test/slide-1.png', cloudinaryPublicId: 'slide-1' },
          ],
        },
      },
      include: { slides: true },
    });
  }

  function authorizedRequest(): Request {
    return new Request('http://localhost/api/pipeline/publish', { method: 'POST', headers: { Authorization: 'Bearer publish-secret' } });
  }

  test('returns 401 when the bearer token does not match', async () => {
    const response = await POST(new Request('http://localhost/api/pipeline/publish', { method: 'POST', headers: { Authorization: 'Bearer wrong-token' } }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(publishCarousel).not.toHaveBeenCalled();
  });

  test('publishes due posts in slide order and removes their Cloudinary images', async () => {
    const post = await createScheduledPost();
    vi.mocked(publishCarousel).mockResolvedValue('instagram-post-1');
    const response = await POST(authorizedRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 1, published: 1, failed: 0 });
    expect(publishCarousel).toHaveBeenCalledWith({ instagramBusinessAccountId: 'ig-business-1', slides: [{ imageUrl: 'https://cdn.test/slide-1.png' }, { imageUrl: 'https://cdn.test/slide-2.png' }] });
    expect(deleteSlideImage).toHaveBeenNthCalledWith(1, 'slide-1');
    expect(deleteSlideImage).toHaveBeenNthCalledWith(2, 'slide-2');
    const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: { slides: { orderBy: { order: 'asc' } } } });
    expect(stored.status).toBe('published');
    expect(stored.instagramPostId).toBe('instagram-post-1');
    expect(stored.publishedAt).toBeInstanceOf(Date);
    expect(stored.slides.every((slide) => slide.imageUrl === null)).toBe(true);
    expect(stored.slides.every((slide) => slide.imageDeletedAt instanceof Date)).toBe(true);
  });

  test('marks publication failure as error and preserves all Cloudinary images', async () => {
    const post = await createScheduledPost();
    vi.mocked(publishCarousel).mockRejectedValue(new Error('Meta unavailable'));
    const response = await POST(authorizedRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 1, published: 0, failed: 1 });
    const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: { slides: true } });
    expect(stored.status).toBe('error');
    expect(stored.errorMessage).toBe('Meta unavailable');
    // Deliberately do not clean Cloudinary after failure: images remain for inspection and reprocessing.
    expect(deleteSlideImage).not.toHaveBeenCalled();
    expect(stored.slides.every((slide) => slide.imageUrl !== null)).toBe(true);
    expect(stored.slides.every((slide) => slide.imageDeletedAt === null)).toBe(true);
  });

  test('does not publish scheduled posts whose scheduled time is in the future', async () => {
    await createScheduledPost(new Date(Date.now() + 60_000));
    const response = await POST(authorizedRequest());
    await expect(response.json()).resolves.toEqual({ processed: 0, published: 0, failed: 0 });
    expect(publishCarousel).not.toHaveBeenCalled();
    expect(deleteSlideImage).not.toHaveBeenCalled();
  });

  test('keeps the post published, records cleanup failure and continues other slides', async () => {
    const post = await createScheduledPost();
    vi.mocked(publishCarousel).mockResolvedValue('instagram-post-1');
    vi.mocked(deleteSlideImage).mockRejectedValueOnce(new Error('Cloudinary unavailable')).mockResolvedValueOnce(undefined);
    const response = await POST(authorizedRequest());
    await expect(response.json()).resolves.toEqual({ processed: 1, published: 1, failed: 0 });
    expect(deleteSlideImage).toHaveBeenCalledTimes(2);
    const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: { slides: { orderBy: { order: 'asc' } } } });
    expect(stored.status).toBe('published');
    expect(stored.errorMessage).toContain('Cloudinary cleanup failed for slide');
    expect(stored.slides[0].imageUrl).toBe('https://cdn.test/slide-1.png');
    expect(stored.slides[1].imageUrl).toBeNull();
  });

  test('is idempotent across consecutive runs after the first run publishes the post', async () => {
    await createScheduledPost();
    vi.mocked(publishCarousel).mockResolvedValue('instagram-post-1');
    const firstResponse = await POST(authorizedRequest());
    const secondResponse = await POST(authorizedRequest());
    await expect(firstResponse.json()).resolves.toEqual({ processed: 1, published: 1, failed: 0 });
    await expect(secondResponse.json()).resolves.toEqual({ processed: 0, published: 0, failed: 0 });
    expect(publishCarousel).toHaveBeenCalledTimes(1);
  });
});
