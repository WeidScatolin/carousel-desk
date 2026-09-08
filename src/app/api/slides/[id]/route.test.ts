import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/lib/ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn().mockResolvedValue('<html>novo</html>') }));
vi.mock('@/lib/render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));
import { prisma } from '@/lib/prisma';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';
import { renderSlideToImage } from '@/lib/render/renderSlideToImage';
import { fixturePost, fixtureBrand, clearFixtures } from '@/test/fixtures';
import { PATCH } from './route';
const request = (body = { headline: 'Novo título', body: 'Novo corpo' }) => new Request('https://test', { method: 'PATCH', body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
afterEach(clearFixtures);
test('edits enqueue rendering and preserve the original composition', async () => {
  const post = await fixturePost(); const brand = await fixtureBrand();
  const id = post.slides[0].id;
  await prisma.slide.update({ where: { id }, data: { sourceImageUrl: 'https://example.test/photo.jpg', kicker: 'Radar', accentPhrase: 'Importante' } });
  const response = await PATCH(request(), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(202);
  expect(renderSlideToImage).not.toHaveBeenCalled();
  expect(generateSlideHtml).toHaveBeenCalledWith(expect.objectContaining({ kicker: 'Radar', accentPhrase: 'Importante', instagramHandle: brand.instagramHandle, slideNumber: 1, totalSlides: 2 }), 'https://example.test/photo.jpg');
  expect(await prisma.slide.findUnique({ where: { id } })).toMatchObject({ imageUrl: null, renderVersion: 1, htmlContent: '<html>novo</html>' });
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'generating', generationComplete: true });
});
test.each(['scheduled', 'publishing', 'published', 'generating'] as const)('cannot modify a %s post', async status => {
  const post = await fixturePost({ status });
  expect((await PATCH(request(), { params: Promise.resolve({ id: post.slides[0].id }) })).status).toBe(409);
  expect(generateSlideHtml).not.toHaveBeenCalled();
});
test('rejects incomplete edits', async () => {
  expect((await PATCH(request({ headline: 'Título' } as never), { params: Promise.resolve({ id: 'missing' }) })).status).toBe(400);
});
