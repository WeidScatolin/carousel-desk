import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { slide: { findUniqueOrThrow: vi.fn(), update: vi.fn() } },
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

describe('PATCH /api/slides/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockReset();
    vi.mocked(prisma.slide.update).mockReset();
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
    vi.mocked(prisma.slide.findUniqueOrThrow).mockResolvedValue({
      id: 'slide-1',
      postId: 'post-1',
      order: 0,
      template: 'cover',
      cloudinaryPublicId: 'old-public-id',
    } as never);
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

    expect(generateSlideHtml).toHaveBeenCalledWith({
      template: 'cover',
      headline: 'Novo título',
      body: 'Novo corpo',
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

  test('returns 400 when the slide uses a template editing does not support yet', async () => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockResolvedValue({
      id: 'slide-1',
      postId: 'post-1',
      order: 0,
      template: 'cover_cinematic',
      cloudinaryPublicId: null,
    } as never);

    const response = await PATCH(buildRequest({ headline: 'Novo título', body: 'Novo corpo' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(response.status).toBe(400);
    expect(generateSlideHtml).not.toHaveBeenCalled();
  });
});
