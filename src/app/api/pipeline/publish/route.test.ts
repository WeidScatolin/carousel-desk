import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/lib/instagram/publishCarousel', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/instagram/publishCarousel')>(), publishCarousel: vi.fn() }));
import { publishCarousel, PublicationUncertainError } from '@/lib/instagram/publishCarousel';
import { prisma } from '@/lib/prisma';
import { fixturePost, clearFixtures } from '@/test/fixtures';
import { POST } from './route';
const request = () => new Request('https://test/api/pipeline/publish', { method: 'POST', headers: { Authorization: 'Bearer test-publish' } });
const due = () => fixturePost({ status: 'scheduled', scheduledAt: new Date(Date.now() - 60_000) });
beforeEach(() => { vi.stubEnv('PUBLISH_API_TOKEN', 'test-publish'); vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', 'ig-test'); vi.mocked(publishCarousel).mockReset().mockResolvedValue('media-1'); });
afterEach(async () => { await clearFixtures(); vi.unstubAllEnvs(); });

test('rejects unauthenticated calls', async () => {
  expect((await POST(new Request('https://test'))).status).toBe(401);
  expect(publishCarousel).not.toHaveBeenCalled();
});
test('publishes due slides in order and retains source images for review', async () => {
  const post = await due();
  expect(await (await POST(request())).json()).toMatchObject({ processed: 1, published: 1, failed: 0 });
  expect(publishCarousel).toHaveBeenCalledWith(expect.objectContaining({ caption: 'Legenda de teste',
    slides: [{ imageUrl: 'https://cdn.test/0.jpg' }, { imageUrl: 'https://cdn.test/1.jpg' }] }), expect.any(Object));
  const stored = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: { slides: true } });
  expect(stored.status).toBe('published'); expect(stored.instagramPostId).toBe('media-1');
  expect(stored.slides.every(s => s.imageUrl)).toBe(true);
});
test('pre-publication errors are visible to Actions and preserve assets', async () => {
  const post = await due(); vi.mocked(publishCarousel).mockRejectedValue(new Error('Container unavailable'));
  const response = await POST(request()); expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ failed: 1 });
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'error', errorStage: 'publish', publicationAttemptedAt: null });
});
test('an ambiguous publication is quarantined and never automatically sent again', async () => {
  const post = await due();
  vi.mocked(publishCarousel).mockImplementation(async (_, checkpoint) => {
    await checkpoint!.onContainerCreated('container-1');
    await checkpoint!.onPublishAttempt();
    throw new PublicationUncertainError('Response lost');
  });
  expect((await POST(request())).status).toBe(503);
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({
    errorStage: 'publish_uncertain', instagramContainerId: 'container-1', publicationAttemptedAt: expect.any(Date), nextRetryAt: null,
  });
  await POST(request()); expect(publishCarousel).toHaveBeenCalledTimes(1);
});
test('future posts remain scheduled', async () => {
  await fixturePost({ status: 'scheduled', scheduledAt: new Date(Date.now() + 3_600_000) });
  await POST(request()); expect(publishCarousel).not.toHaveBeenCalled();
});
test('concurrent requests publish a post only once', async () => {
  await due();
  vi.mocked(publishCarousel).mockImplementation(async () => { await new Promise(r => setTimeout(r, 20)); return 'media-1'; });
  const responses = await Promise.all([POST(request()), POST(request())]);
  expect(publishCarousel).toHaveBeenCalledTimes(1);
  expect((await Promise.all(responses.map(r => r.json()))).reduce((sum, r) => sum + r.published, 0)).toBe(1);
});
test('subsequent runs cannot republish a completed post', async () => {
  await due(); await POST(request()); await POST(request());
  expect(publishCarousel).toHaveBeenCalledTimes(1);
});
test('pausing automatic operation holds automatic scheduled posts', async () => {
  await fixturePost({ status: 'scheduled', scheduledAt: new Date(Date.now() - 60_000), autopilotSlot: '2026-09-08:0' });
  await POST(request()); expect(publishCarousel).not.toHaveBeenCalled();
});
