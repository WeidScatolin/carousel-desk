import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/lib/instagram/fetchComments', () => ({ fetchCommentsPage: vi.fn() }));
vi.mock('@/lib/leads/deliverCommentReply', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/leads/deliverCommentReply')>(), deliverCommentReply: vi.fn() }));
import { fetchCommentsPage } from '@/lib/instagram/fetchComments';
import { deliverCommentReply } from '@/lib/leads/deliverCommentReply';
import { prisma } from '@/lib/prisma';
import { fixturePost, clearFixtures } from '@/test/fixtures';
import { POST } from './route';
const request = () => new Request('https://test', { method: 'POST', headers: { Authorization: 'Bearer test-publish' } });
const comment = () => ({ id: 'comment-' + crypto.randomUUID(), text: 'Quero GUIA', username: 'test-person', timestamp: new Date(Date.now() - 60_000).toISOString() });
async function automation() {
  const post = await fixturePost({ status: 'published', instagramPostId: 'media-' + crypto.randomUUID() });
  return prisma.commentAutomation.create({ data: { postId: post.id, instagramMediaId: post.instagramPostId!,
    keyword: 'GUIA', normalizedKeyword: 'guia', replyMessage: 'Aqui está!', status: 'ACTIVE' } });
}
beforeEach(() => {
  vi.stubEnv('PUBLISH_API_TOKEN', 'test-publish');
  vi.mocked(fetchCommentsPage).mockReset().mockResolvedValue({ data: [], after: null });
  vi.mocked(deliverCommentReply).mockReset().mockResolvedValue({ status: 'SIMULATED', externalMessageId: 'simulation', lastError: null });
});
afterEach(async () => { await clearFixtures(); vi.unstubAllEnvs(); });
test('authentication and an empty queue never contact Meta', async () => {
  expect((await POST(new Request('https://test'))).status).toBe(401);
  expect(await (await POST(request())).json()).toMatchObject({ postsChecked: 0, sent: 0 });
  expect(fetchCommentsPage).not.toHaveBeenCalled();
});
test('saves a pagination cursor and does not resend a matched comment', async () => {
  const a = await automation(); const c = comment();
  vi.mocked(fetchCommentsPage).mockResolvedValue({ data: [c], after: 'next-page' });
  await POST(request()); await POST(request());
  expect(deliverCommentReply).toHaveBeenCalledTimes(1);
  expect(fetchCommentsPage).toHaveBeenLastCalledWith(a.instagramMediaId, 'next-page');
  expect(await prisma.commentDelivery.findUnique({ where: { instagramCommentId: c.id } })).toMatchObject({ status: 'SIMULATED' });
});
test('fetch failures are visible as HTTP 503 instead of a successful empty run', async () => {
  await automation(); vi.mocked(fetchCommentsPage).mockRejectedValue(new Error('Token expired'));
  const response = await POST(request());
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ failed: 1 });
});
test('does not send private replies outside the seven-day window', async () => {
  await automation();
  vi.mocked(fetchCommentsPage).mockResolvedValue({ data: [{ ...comment(), timestamp: new Date(Date.now() - 8 * 86_400_000).toISOString() }], after: null });
  await POST(request()); expect(deliverCommentReply).not.toHaveBeenCalled();
});
test('ambiguous sends stay uncertain and are not retried', async () => {
  await automation(); const c = comment();
  vi.mocked(fetchCommentsPage).mockResolvedValue({ data: [c], after: null });
  vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'UNCERTAIN', externalMessageId: null, lastError: 'Response lost' });
  expect((await POST(request())).status).toBe(503);
  await POST(request());
  expect(deliverCommentReply).toHaveBeenCalledTimes(1);
  expect(await prisma.commentDelivery.findUnique({ where: { instagramCommentId: c.id } })).toMatchObject({ status: 'UNCERTAIN', deliveredAt: null, nextRetryAt: null });
});
test('known rejected deliveries retry after backoff and stop at the cap', async () => {
  await automation(); const c = comment();
  vi.mocked(fetchCommentsPage).mockResolvedValue({ data: [c], after: null });
  vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'FAILED', externalMessageId: null, lastError: 'HTTP 429' });
  await POST(request()); await POST(request());
  expect(deliverCommentReply).toHaveBeenCalledTimes(1);
  await prisma.commentDelivery.update({ where: { instagramCommentId: c.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
  await POST(request()); expect(deliverCommentReply).toHaveBeenCalledTimes(2);
  await prisma.commentDelivery.update({ where: { instagramCommentId: c.id }, data: { retryCount: 3, nextRetryAt: new Date(Date.now() - 1000) } });
  await POST(request()); expect(deliverCommentReply).toHaveBeenCalledTimes(2);
});
test('a nonmatching comment is never sent and is absent from the API response', async () => {
  await automation(); const c = { ...comment(), text: 'Conteúdo privado de teste' };
  vi.mocked(fetchCommentsPage).mockResolvedValue({ data: [c], after: null });
  const response = await POST(request());
  expect(await response.text()).not.toContain(c.text);
  expect(deliverCommentReply).not.toHaveBeenCalled();
});
