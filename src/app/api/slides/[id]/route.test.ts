import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { slide: { findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() } },
}));
vi.mock('@/lib/ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn() }));
vi.mock('@/lib/render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));
vi.mock('@/lib/storage/cloudinary', () => ({ uploadSlideImage: vi.fn(), deleteSlideImage: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';
import { renderSlideToImage } from '@/lib/render/renderSlideToImage';
import { uploadSlideImage, deleteSlideImage } from '@/lib/storage/cloudinary';
import { PATCH } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/slides/slide-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const baseSlide = {
  id: 'slide-1',
  postId: 'post-1',
  order: 2,
  template: 'cover_cinematic',
  cloudinaryPublicId: 'old-public-id',
  sourceImageUrl: 'https://example.com/original-photo.jpg',
  accentPhrase: 'não escala',
  kicker: 'Radar',
  sourceLabel: 'TechCrunch, 2026',
};

describe('PATCH /api/slides/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockReset();
    vi.mocked(prisma.slide.update).mockReset();
    vi.mocked(prisma.slide.count).mockReset();
    vi.mocked(generateSlideHtml).mockReset();
    vi.mocked(renderSlideToImage).mockReset();
    vi.mocked(uploadSlideImage).mockReset();
    vi.mocked(deleteSlideImage).mockReset();
  });

  test('returns 400 when headline or body is missing', async () => {
    const response = await PATCH(buildRequest({ headline: 'Só título' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(response.status).toBe(400);
  });

  test('regenerates HTML and image, deletes the old Cloudinary asset, and updates the slide', async () => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockResolvedValue(baseSlide as never);
    vi.mocked(prisma.slide.count).mockResolvedValue(9);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html>novo</html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({
      url: 'https://cloudinary.test/new.png',
      publicId: 'new-public-id',
    });
    vi.mocked(prisma.slide.update).mockResolvedValue({ id: 'slide-1' } as never);

    const response = await PATCH(buildRequest({ headline: 'Novo título', body: 'Novo corpo' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(deleteSlideImage).toHaveBeenCalledWith('old-public-id');
    expect(prisma.slide.update).toHaveBeenCalledWith({
      where: { id: 'slide-1' },
      data: {
        htmlContent: '<html>novo</html>',
        imageUrl: 'https://cloudinary.test/new.png',
        cloudinaryPublicId: 'new-public-id',
      },
    });
    expect(response.status).toBe(200);
  });

  test('preserves the original background photo, accentPhrase, kicker, sourceLabel and slide numbering on edit', async () => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockResolvedValue(baseSlide as never);
    vi.mocked(prisma.slide.count).mockResolvedValue(9);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html>novo</html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({ url: 'https://cloudinary.test/new.png', publicId: 'new-id' });
    vi.mocked(prisma.slide.update).mockResolvedValue({ id: 'slide-1' } as never);

    await PATCH(buildRequest({ headline: 'Novo título', body: 'Novo corpo' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(generateSlideHtml).toHaveBeenCalledWith(
      {
        template: 'cover_cinematic',
        headline: 'Novo título',
        body: 'Novo corpo',
        accentPhrase: 'não escala',
        kicker: 'Radar',
        sourceLabel: 'TechCrunch, 2026',
        slideNumber: 3,
        totalSlides: 9,
      },
      'https://example.com/original-photo.jpg',
    );
  });

  test('supports editing every slide template, including the new Fase 5 templates', async () => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockResolvedValue({ ...baseSlide, template: 'risk' } as never);
    vi.mocked(prisma.slide.count).mockResolvedValue(9);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html>novo</html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({ url: 'https://cloudinary.test/new.png', publicId: 'new-id' });
    vi.mocked(prisma.slide.update).mockResolvedValue({ id: 'slide-1' } as never);

    const response = await PATCH(buildRequest({ headline: 'Novo título', body: 'Novo corpo' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(response.status).toBe(200);
    expect(generateSlideHtml).toHaveBeenCalledTimes(1);
  });
});
