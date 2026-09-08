import { prisma } from '@/lib/prisma';
import { discoverThemes } from './discoverThemes';
import { generatePostFromTheme } from './generatePostFromTheme';
import { linkCommentAutomation } from './linkCommentAutomation';
import { findApprovalBlockers } from '@/lib/validation/postApproval';

export function dayKey(now: Date): string { return now.toISOString().slice(0, 10); }
export function slotTime(day: string, index: number, hour: number, limit: number): Date {
  const start = new Date(day + 'T00:00:00.000Z').getTime();
  const slotHour = hour + Math.floor(index * (24 - hour) / limit);
  return new Date(start + slotHour * 3_600_000);
}

export async function recoverStalledPosts(now: Date): Promise<number> {
  const stale = await prisma.post.findMany({
    where: { status: { in: ['generating', 'publishing'] },
      OR: [{ processingStartedAt: { lt: new Date(now.getTime() - 60 * 60_000) } },
        { processingStartedAt: null, updatedAt: { lt: new Date(now.getTime() - 60 * 60_000) } }] },
    take: 30,
  });
  let recovered = 0;
  for (const post of stale) {
    const uncertain = post.status === 'publishing' && !!post.publicationAttemptedAt;
    const result = await prisma.post.updateMany({
      where: { id: post.id, status: post.status, updatedAt: post.updatedAt },
      data: { status: 'error', errorStage: post.status === 'publishing' ? (uncertain ? 'publish_uncertain' : 'publish')
        : (post.generationComplete ? 'render' : 'generation'),
        errorMessage: uncertain ? 'Publication outcome needs verification in Instagram' : 'Worker exceeded its processing deadline',
        nextRetryAt: uncertain ? null : now },
    });
    recovered += result.count;
  }
  return recovered;
}

export async function runAutopilot(now = new Date()): Promise<Record<string, number>> {
  const counts = { generated: 0, scheduled: 0, retried: 0, recovered: 0, discovered: 0, blocked: 0 };
  const settings = await prisma.automationSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  counts.recovered = await recoverStalledPosts(now);
  if (!settings.enabled) return counts;
  const today = dayKey(now);

  // Never drain yesterday's automatic queue in a burst after downtime.
  await prisma.post.updateMany({
    where: { autopilotSlot: { not: null, lt: today + ':0' }, status: { in: ['pending_approval', 'scheduled'] } },
    data: { status: 'rejected', rejectionReason: 'Janela diária da operação automática encerrada' },
  });
  const ready = await prisma.post.findMany({
    where: { status: 'pending_approval', autopilotSlot: { startsWith: today + ':' } },
    include: { slides: true, leadMagnet: true }, take: 3,
  });
  for (const post of ready) {
    const blockers = findApprovalBlockers(post);
    if (post.postGoal === 'comment_dm' && (!settings.autoCommentReplies
        || process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED !== 'true' || !post.leadMagnet?.active
        || !post.leadMagnet.deliveryUrl.startsWith('https://'))) {
      blockers.push('A entrega do material precisa estar ativa antes de publicar o convite.');
    }
    if (blockers.length) {
      counts.blocked++;
      await prisma.post.update({ where: { id: post.id }, data: { errorStage: 'approval', errorMessage: blockers.join(' ') } });
      continue;
    }
    const index = Number(post.autopilotSlot!.split(':')[1]);
    if (index >= settings.dailyPostLimit) continue;
    const target = slotTime(today, index, settings.publishHourUtc, settings.dailyPostLimit);
    const result = await prisma.post.updateMany({
      where: { id: post.id, status: 'pending_approval', instagramPostId: null, publicationAttemptedAt: null },
      data: { status: 'scheduled', scheduledAt: new Date(Math.max(target.getTime(), now.getTime() + 60_000)),
        errorStage: null, errorMessage: null },
    });
    counts.scheduled += result.count;
  }

  const links = await prisma.post.findMany({ where: { status: 'published', errorStage: 'comment_link' }, take: 3 });
  for (const post of links) {
    await linkCommentAutomation(post.id);
    await prisma.post.update({ where: { id: post.id }, data: { errorStage: null, errorMessage: null } });
  }

  const retry = await prisma.post.findFirst({
    where: { status: 'error', autopilotSlot: { startsWith: today + ':' }, retryCount: { lt: 3 },
      errorStage: { in: ['generation', 'render', 'publish'] }, nextRetryAt: { lte: now },
      instagramPostId: null, publicationAttemptedAt: null },
    orderBy: { nextRetryAt: 'asc' },
  });
  if (retry) {
    const claim = await prisma.post.updateMany({
      where: { id: retry.id, status: 'error', retryCount: retry.retryCount },
      data: { status: retry.errorStage === 'publish' ? 'scheduled' : 'generating',
        processingStartedAt: now, nextRetryAt: null, retryCount: { increment: 1 } },
    });
    if (claim.count) {
      counts.retried++;
      if (retry.errorStage === 'generation') await generatePostFromTheme(retry.themeId, retry.id);
    }
    return counts;
  }

  const reserved = await prisma.post.findMany({
    where: { autopilotSlot: { startsWith: today + ':' } }, select: { autopilotSlot: true },
  });
  const slots = new Set(reserved.map(p => p.autopilotSlot));
  const index = Array.from({ length: settings.dailyPostLimit }, (_, i) => i).find(i => !slots.has(today + ':' + i));
  if (index === undefined) return counts;

  const where = {
    status: 'pending' as const, hasSufficientEvidence: true,
    articlePublishedAt: { gte: new Date(now.getTime() - 7 * 86_400_000), lte: now },
    posts: { none: {} },
    contentBrief: { is: { totalScore: { gte: settings.minThemeScore }, OR: [
      { postGoal: { in: ['follow' as const, 'save_share' as const] } },
      ...(settings.autoCommentReplies && process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED === 'true'
        ? [{ postGoal: 'comment_dm' as const, leadMagnet: { is: { active: true, deliveryUrl: { startsWith: 'https://' } } } }] : []),
    ] } },
  };
  let theme = await prisma.theme.findFirst({ where, include: { contentBrief: true }, orderBy: { contentBrief: { totalScore: 'desc' } } });
  if (!theme) {
    const discovery = await prisma.pipelineState.findUnique({ where: { stage: 'discover' } });
    if (!discovery?.lastStartedAt || now.getTime() - discovery.lastStartedAt.getTime() >= 6 * 3_600_000) {
      counts.discovered = (await discoverThemes()).discovered;
      // Scoring and copy generation use separate invocations and time budgets.
      return counts;
    }
  }
  if (!theme?.contentBrief) { counts.blocked++; return counts; }
  const selected = theme;
  const brief = theme.contentBrief;
  const post = await prisma.$transaction(async tx => {
    const claim = await tx.theme.updateMany({ where: { id: selected.id, status: 'pending' }, data: { status: 'approved' } });
    if (!claim.count) return null;
    return tx.post.create({ data: { themeId: selected.id, autopilotSlot: today + ':' + index,
      status: 'generating', processingStartedAt: now, postGoal: brief.postGoal, contentPillar: brief.contentPillar,
      funnelStage: brief.funnelStage, leadMagnetId: brief.leadMagnetId } });
  });
  if (post) { await generatePostFromTheme(selected.id, post.id); counts.generated++; }
  return counts;
}
