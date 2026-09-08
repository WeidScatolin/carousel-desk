import { afterEach, expect, test } from 'vitest';
import { prisma } from '@/lib/prisma';
import { fixturePost, clearFixtures } from '@/test/fixtures';
import { PATCH } from './route';
const req = (body: unknown) => new Request('https://test', { method: 'PATCH', body: JSON.stringify(body) });
afterEach(clearFixtures);
test('edits a draft and clears any obsolete container', async () => {
  const post = await fixturePost({ instagramContainerId: 'old-container' });
  expect((await PATCH(req({ caption: 'Nova legenda', ctaKeyword: 'mapa' }), { params: Promise.resolve({ id: post.id }) })).status).toBe(200);
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ caption: 'Nova legenda', ctaKeyword: 'MAPA', instagramContainerId: null });
});
test.each(['scheduled', 'publishing', 'published'] as const)('does not change a %s post', async status => {
  const post = await fixturePost({ status });
  expect((await PATCH(req({ caption: 'Outra legenda' }), { params: Promise.resolve({ id: post.id }) })).status).toBe(409);
});
test('rejects invalid payload', async () => {
  expect((await PATCH(req({ caption: '' }), { params: Promise.resolve({ id: 'missing' }) })).status).toBe(400);
});
