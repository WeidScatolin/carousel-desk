import { fetchCommentsPage } from '@/lib/instagram/fetchComments';
import { composeReplyMessage, deliverCommentReply } from '@/lib/leads/deliverCommentReply';
import { matchesKeyword } from '@/lib/leads/matchKeyword';
import { normalizeKeyword } from '@/lib/leads/normalizeKeyword';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintViolation } from '@/lib/prismaErrors';
import { isPipelineAuthorized } from '@/lib/pipeline/auth';
import { acquireStage, finishStage, safeError } from '@/lib/pipeline/state';

export const maxDuration = 300;
export async function POST(request: Request): Promise<Response> {
  if (!isPipelineAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = await acquireStage('comments');
  if (!owner) return Response.json({ busy: true });
  const counts = { postsChecked: 0, commentsFound: 0, newComments: 0, matched: 0, simulated: 0, sent: 0, ignored: 0, failed: 0 };
  let failure: string | undefined;
  let mediaId: string | undefined;
  try {
    // Crashes during delivery are ambiguous: never turn them into retryable sends.
    await prisma.commentDelivery.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      data: { status: 'UNCERTAIN', lastError: 'Delivery worker stopped before recording the result; verify Instagram' },
    });
    const first = await prisma.commentAutomation.findFirst({
      where: { status: 'ACTIVE' }, orderBy: [{ lastPolledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
    if (first) {
      const automations = await prisma.commentAutomation.findMany({
        where: { status: 'ACTIVE', instagramMediaId: first.instagramMediaId }, orderBy: { createdAt: 'asc' },
      });
      counts.postsChecked = 1;
      mediaId = first.instagramMediaId;
      const page = await fetchCommentsPage(first.instagramMediaId, first.commentsCursor);
      counts.commentsFound = page.data.length;
      for (const comment of page.data) {
        const commentedAt = new Date(comment.timestamp);
        const cutoff = Date.now() - 7 * 86_400_000;
        if (!Number.isFinite(commentedAt.getTime()) || commentedAt.getTime() <= cutoff || commentedAt.getTime() > Date.now()) {
          counts.ignored++; continue;
        }
        const existing = await prisma.commentDelivery.findUnique({ where: { instagramCommentId: comment.id } });
        const chosen = automations.find(a => matchesKeyword(comment.text, a.keyword, a.matchMode));
        if (!chosen) { counts.ignored++; continue; }
        if (existing && (existing.automationId !== chosen.id || existing.status !== 'FAILED' || existing.retryCount >= 3
            || !existing.nextRetryAt || existing.nextRetryAt.getTime() > Date.now())) continue;
        let delivery;
        if (existing) {
          const claim = await prisma.commentDelivery.updateMany({
            where: { id: existing.id, status: 'FAILED', retryCount: existing.retryCount },
            data: { status: 'PROCESSING', retryCount: { increment: 1 }, nextRetryAt: null },
          });
          if (!claim.count) continue;
          delivery = existing;
        } else {
          counts.newComments++;
          try {
            delivery = await prisma.commentDelivery.create({ data: {
              automationId: chosen.id, instagramCommentId: comment.id, instagramMediaId: first.instagramMediaId,
              instagramUsername: comment.username, originalComment: comment.text, normalizedComment: normalizeKeyword(comment.text),
              commentedAt, status: 'PROCESSING',
            } });
          } catch (error) { if (isUniqueConstraintViolation(error)) continue; throw error; }
        }
        counts.matched++;
        const outcome = await deliverCommentReply(comment.id, composeReplyMessage(chosen));
        await prisma.commentDelivery.update({ where: { id: delivery.id }, data: {
          status: outcome.status, externalMessageId: outcome.externalMessageId, lastError: outcome.lastError,
          deliveredAt: ['SENT', 'SIMULATED'].includes(outcome.status) ? new Date() : null,
          nextRetryAt: outcome.status === 'FAILED' ? new Date(Date.now() + 15 * 60_000) : null,
        } });
        if (outcome.status === 'SENT') counts.sent++;
        else if (outcome.status === 'SIMULATED') counts.simulated++;
        else { counts.failed++; failure = outcome.lastError ?? 'Comment delivery failed'; }
      }
      await prisma.commentAutomation.updateMany({
        where: { instagramMediaId: first.instagramMediaId },
        data: { commentsCursor: page.after, lastPolledAt: new Date() },
      });
    }
  } catch (error) {
    counts.failed++; failure = safeError(error);
    if (mediaId) await prisma.commentAutomation.updateMany({
      where: { instagramMediaId: mediaId }, data: { lastPolledAt: new Date(), commentsCursor: null },
    });
  }
  await finishStage('comments', owner, counts, failure);
  return Response.json({ ...counts, ...(failure ? { error: failure } : {}) }, { status: counts.failed ? 503 : 200 });
}
