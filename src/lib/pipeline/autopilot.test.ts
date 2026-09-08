import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('./generatePostFromTheme', () => ({ generatePostFromTheme: vi.fn().mockResolvedValue('generated') }));
vi.mock('./discoverThemes', () => ({ discoverThemes: vi.fn().mockResolvedValue({ discovered: 0, failed: 0 }) }));
import { prisma } from '@/lib/prisma';
import { fixturePost, clearFixtures } from '@/test/fixtures';
import { generatePostFromTheme } from './generatePostFromTheme';
import { runAutopilot, dayKey, slotTime } from './autopilot';

beforeEach(async () => {
  vi.mocked(generatePostFromTheme).mockClear();
  await prisma.automationSettings.upsert({ where: { id: 'default' },
    create: { id: 'default', enabled: true }, update: { enabled: true, dailyPostLimit: 1, publishHourUtc: 12, autoCommentReplies: false } });
});
afterEach(clearFixtures);
async function candidate(date = new Date()) {
  return prisma.theme.create({ data: {
    id: 'fixture-' + crypto.randomUUID(), sourceUrl: 'https://example.test/' + crypto.randomUUID(),
    headlineSuggestion: 'Tema', summary: 'Resumo', hasSufficientEvidence: true, articlePublishedAt: date,
    contentBrief: { create: { contentPillar: 'radar', funnelStage: 'awareness', postGoal: 'follow',
      targetPain: 'Tempo', businessApplication: 'Automação', hook: 'Gancho', angle: 'Aplicação', strategicRationale: 'Teste',
      audienceFitScore: 90, businessImpactScore: 90, hookPotentialScore: 90, evidenceQualityScore: 90,
      offerBridgeScore: 90, noveltyScore: 90, totalScore: 90 } },
  } });
}
test('reserves at most one post per configured day, including repeated runs', async () => {
  await candidate(); await candidate();
  await runAutopilot(); await runAutopilot();
  expect(generatePostFromTheme).toHaveBeenCalledTimes(1);
  expect(await prisma.post.count({ where: { autopilotSlot: { startsWith: dayKey(new Date()) + ':' } } })).toBe(1);
});
test('only complete rendered carousels are scheduled', async () => {
  const post = await fixturePost({ autopilotSlot: dayKey(new Date()) + ':0' });
  await runAutopilot();
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'scheduled', scheduledAt: expect.any(Date) });
});
test('a missing image holds a post for review', async () => {
  const post = await fixturePost({ autopilotSlot: dayKey(new Date()) + ':0' });
  await prisma.slide.update({ where: { id: post.slides[0].id }, data: { imageUrl: null } });
  expect((await runAutopilot()).blocked).toBe(1);
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'pending_approval', errorStage: 'approval' });
});
test('pausing prevents selection and scheduling', async () => {
  await candidate();
  await prisma.automationSettings.update({ where: { id: 'default' }, data: { enabled: false } });
  await runAutopilot();
  expect(generatePostFromTheme).not.toHaveBeenCalled();
});
test('old news never passes automatic selection', async () => {
  await candidate(new Date(Date.now() - 10 * 86_400_000));
  await runAutopilot(); expect(generatePostFromTheme).not.toHaveBeenCalled();
});
test('expired automatic queues are not drained after downtime', async () => {
  const day = dayKey(new Date(Date.now() - 86_400_000));
  const post = await fixturePost({ status: 'scheduled', autopilotSlot: day + ':0' });
  await runAutopilot();
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'rejected' });
});
test('uncertain publications never enter automatic retry', async () => {
  const post = await fixturePost({ status: 'error', errorStage: 'publish_uncertain',
    publicationAttemptedAt: new Date(), autopilotSlot: dayKey(new Date()) + ':0' });
  await runAutopilot();
  expect(await prisma.post.findUnique({ where: { id: post.id } })).toMatchObject({ status: 'error', errorStage: 'publish_uncertain' });
});
test('a capped generation failure does not consume more AI calls', async () => {
  await fixturePost({ status: 'error', errorStage: 'generation', retryCount: 3,
    nextRetryAt: new Date(Date.now() - 60_000), autopilotSlot: dayKey(new Date()) + ':0' });
  await runAutopilot(); expect(generatePostFromTheme).not.toHaveBeenCalled();
});
test('daily slots use explicit UTC hours', () => {
  expect(slotTime('2026-09-08', 0, 12, 3).toISOString()).toBe('2026-09-08T12:00:00.000Z');
  expect(slotTime('2026-09-08', 1, 12, 3).toISOString()).toBe('2026-09-08T16:00:00.000Z');
  expect(slotTime('2026-09-08', 2, 12, 3).toISOString()).toBe('2026-09-08T20:00:00.000Z');
});
