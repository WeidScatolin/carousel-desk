import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/lib/storage/cloudinary', () => ({ uploadSlideImage: vi.fn(), deleteSlideImage: vi.fn().mockResolvedValue(undefined) }));
import { prisma } from '@/lib/prisma';
import { uploadSlideImage } from '@/lib/storage/cloudinary';
import { fixturePost, clearFixtures } from '@/test/fixtures';
import { POST } from './route';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const request = (version = 0) => new Request('https://test', { method: 'POST', headers: { Authorization: 'Bearer test-publish' },
  body: JSON.stringify({ imageBase64: jpeg, renderVersion: version }) });
beforeEach(() => {
  vi.stubEnv('PUBLISH_API_TOKEN', 'test-publish');
  vi.mocked(uploadSlideImage).mockReset().mockImplementation(async () => ({ url: 'https://cdn.test/new.jpg', publicId: crypto.randomUUID() }));
});
afterEach(async () => { await clearFixtures(); vi.unstubAllEnvs(); });

test('requires authentication', async () => {
  expect((await POST(new Request('https://test'), { params: Promise.resolve({ id: 'missing' }) })).status).toBe(401);
});
test('does not make an incomplete generation ready', async () => {
  const post = await fixturePost({ status: 'generating', generationComplete: false });
  await prisma.slide.updateMany({ where: { postId: post.id }, data: { imageUrl: null } });
  const response = await POST(request(), { params: Promise.resolve({ id: post.slides[0].id }) });
  expect(response.status).toBe(409);
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'generating' });
});
test('only the complete expected slide set can reach approval', async () => {
  const post = await fixturePost({ status: 'generating' });
  await prisma.slide.updateMany({ where: { postId: post.id }, data: { imageUrl: null } });
  await POST(request(), { params: Promise.resolve({ id: post.slides[0].id }) });
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'generating' });
  await POST(request(), { params: Promise.resolve({ id: post.slides[1].id }) });
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'pending_approval' });
});
test('late render results cannot overwrite an edited slide', async () => {
  const post = await fixturePost({ status: 'generating' });
  await prisma.slide.update({ where: { id: post.slides[0].id }, data: { imageUrl: null, renderVersion: 2 } });
  expect((await POST(request(1), { params: Promise.resolve({ id: post.slides[0].id }) })).status).toBe(409);
  expect(uploadSlideImage).not.toHaveBeenCalled();
});
test('a duplicate successful callback does not upload again', async () => {
  const post = await fixturePost({ status: 'generating' });
  await prisma.slide.update({ where: { id: post.slides[0].id }, data: { imageUrl: null } });
  await POST(request(), { params: Promise.resolve({ id: post.slides[0].id }) });
  await POST(request(), { params: Promise.resolve({ id: post.slides[0].id }) });
  expect(uploadSlideImage).toHaveBeenCalledTimes(1);
});
