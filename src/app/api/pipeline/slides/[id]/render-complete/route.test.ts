import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    slide: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    post: { updateMany: vi.fn() },
  },
}));
vi.mock('@/lib/storage/cloudinary', () => ({ uploadSlideImage: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { uploadSlideImage } from '@/lib/storage/cloudinary';
import { POST } from './route';

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function authorizedRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { Authorization: 'Bearer publish-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/pipeline/slides/[id]/render-complete', () => {
  beforeEach(() => {
    process.env.PUBLISH_API_TOKEN = 'publish-secret';
    vi.mocked(prisma.slide.findUnique).mockReset();
    vi.mocked(prisma.slide.update).mockReset();
    vi.mocked(prisma.slide.count).mockReset();
    vi.mocked(prisma.post.updateMany).mockReset();
    vi.mocked(uploadSlideImage).mockReset();
  });

  test('returns 401 without a valid bearer token', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST' }), paramsFor('slide-1'));
    expect(response.status).toBe(401);
  });

  test('returns 404 when the slide does not exist', async () => {
    vi.mocked(prisma.slide.findUnique).mockResolvedValue(null);

    const response = await POST(authorizedRequest({ imageBase64: 'aGVsbG8=' }), paramsFor('slide-1'));

    expect(response.status).toBe(404);
  });

  test('uploads the image, updates the slide, and marks the post pending_approval when it was the last one', async () => {
    vi.mocked(prisma.slide.findUnique).mockResolvedValue({ id: 'slide-1', postId: 'post-1' } as never);
    vi.mocked(uploadSlideImage).mockResolvedValue({ url: 'https://cloudinary.test/img.png', publicId: 'pub-1' });
    vi.mocked(prisma.slide.count).mockResolvedValue(0);

    const response = await POST(authorizedRequest({ imageBase64: 'aGVsbG8=' }), paramsFor('slide-1'));

    expect(response.status).toBe(200);
    expect(prisma.slide.update).toHaveBeenCalledWith({
      where: { id: 'slide-1' },
      data: { imageUrl: 'https://cloudinary.test/img.png', cloudinaryPublicId: 'pub-1' },
    });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post-1', status: 'generating' },
      data: { status: 'pending_approval' },
    });
  });

  test('does not touch the post status when other slides still need rendering', async () => {
    vi.mocked(prisma.slide.findUnique).mockResolvedValue({ id: 'slide-1', postId: 'post-1' } as never);
    vi.mocked(uploadSlideImage).mockResolvedValue({ url: 'https://cloudinary.test/img.png', publicId: 'pub-1' });
    vi.mocked(prisma.slide.count).mockResolvedValue(2);

    await POST(authorizedRequest({ imageBase64: 'aGVsbG8=' }), paramsFor('slide-1'));

    expect(prisma.post.updateMany).not.toHaveBeenCalled();
  });
});
