import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../ai/writeCopy', () => ({ writeCopy: vi.fn() }));
vi.mock('../ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn() }));
vi.mock('../render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));
vi.mock('../storage/cloudinary', () => ({ uploadSlideImage: vi.fn() }));

import { writeCopy } from '../ai/writeCopy';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';
import { generatePostFromTheme } from './generatePostFromTheme';
import { prisma } from '@/lib/prisma';

describe('generatePostFromTheme', () => {
  let themeId: string;

  beforeEach(async () => {
    vi.mocked(writeCopy).mockReset();
    vi.mocked(generateSlideHtml).mockReset();
    vi.mocked(renderSlideToImage).mockReset();
    vi.mocked(uploadSlideImage).mockReset();

    const theme = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/news',
        summary: 'resumo de teste',
        headlineSuggestion: 'Tema de teste',
        status: 'approved',
      },
    });
    themeId = theme.id;
  });

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId } } });
    await prisma.post.deleteMany({ where: { themeId } });
    await prisma.theme.delete({ where: { id: themeId } });
  });

  test('creates a post with generated slides and marks it pending_approval', async () => {
    vi.mocked(writeCopy).mockResolvedValue([
      { template: 'cover', headline: 'Título', body: 'Corpo' },
    ]);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({
      url: 'https://cloudinary.test/img.png',
      publicId: 'test-public-id',
    });

    const postId = await generatePostFromTheme(themeId);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { slides: true },
    });

    expect(post.status).toBe('pending_approval');
    expect(post.slides).toHaveLength(1);
    expect(post.slides[0].imageUrl).toBe('https://cloudinary.test/img.png');
  });

  test('marks the post as error when generation fails', async () => {
    vi.mocked(writeCopy).mockRejectedValue(new Error('provider unavailable'));

    await expect(generatePostFromTheme(themeId)).rejects.toThrow('provider unavailable');

    const posts = await prisma.post.findMany({ where: { themeId } });

    expect(posts).toHaveLength(1);
    expect(posts[0].status).toBe('error');
    expect(posts[0].errorMessage).toBe('provider unavailable');
  });
});
