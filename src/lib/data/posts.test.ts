import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { listPostsByStatus } from './posts';

describe('listPostsByStatus', () => {
  let themeId: string;

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId } } });
    await prisma.post.deleteMany({ where: { themeId } });
    await prisma.theme.deleteMany({ where: { id: themeId } });
  });

  test('returns posts of the given status with their slides ordered', async () => {
    const theme = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/posts-data-test',
        summary: 'resumo',
        headlineSuggestion: 'Tema com post',
        status: 'approved',
      },
    });
    themeId = theme.id;

    const post = await prisma.post.create({
      data: { themeId: theme.id, status: 'pending_approval' },
    });

    await prisma.slide.create({
      data: { postId: post.id, order: 1, template: 'evidence', htmlContent: '<html></html>' },
    });
    await prisma.slide.create({
      data: { postId: post.id, order: 0, template: 'cover', htmlContent: '<html></html>' },
    });

    const [result] = await listPostsByStatus('pending_approval');

    expect(result.id).toBe(post.id);
    expect(result.slides.map((slide) => slide.order)).toEqual([0, 1]);
    expect(result.theme.sourceUrl).toBe('https://example.com/posts-data-test');
    expect(result.leadMagnet).toBeNull();
  });
});
