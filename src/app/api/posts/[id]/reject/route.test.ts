import { afterEach, expect, test } from 'vitest';
import { prisma } from '@/lib/prisma';
import { fixturePost, clearFixtures } from '@/test/fixtures';
import { POST } from './route';
const req = (body: unknown) => new Request('https://test', { method: 'POST', body: JSON.stringify(body) });
afterEach(clearFixtures);
test('rejects a pending draft and cancels its retries', async () => {
  const post = await fixturePost({ nextRetryAt: new Date() });
  expect((await POST(req({ reason: 'Revisar texto' }), { params: Promise.resolve({ id: post.id }) })).status).toBe(200);
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'rejected', nextRetryAt: null });
});
test.each(['publishing', 'published'] as const)('does not reset a %s post', async status => {
  const post = await fixturePost({ status });
  expect((await POST(req({ reason: 'Texto' }), { params: Promise.resolve({ id: post.id }) })).status).toBe(409);
});
test('does not reset an ambiguous publication', async () => {
  const post = await fixturePost({ status: 'error', errorStage: 'publish_uncertain', publicationAttemptedAt: new Date() });
  expect((await POST(req({ reason: 'Texto' }), { params: Promise.resolve({ id: post.id }) })).status).toBe(409);
});
test('requires a reason', async () => {
  expect((await POST(req({}), { params: Promise.resolve({ id: 'missing' }) })).status).toBe(400);
});
