import { publishCarousel, PublicationUncertainError, MetaRejectedError, ContainerExpiredError } from '@/lib/instagram/publishCarousel';
import { prisma } from '@/lib/prisma';
import { isPipelineAuthorized } from '@/lib/pipeline/auth';
import { acquireStage, finishStage, safeError } from '@/lib/pipeline/state';
import { linkCommentAutomation } from '@/lib/pipeline/linkCommentAutomation';
import { findApprovalBlockers } from '@/lib/validation/postApproval';

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!isPipelineAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = await acquireStage('publish');
  if (!owner) return Response.json({ processed: 0, published: 0, failed: 0, busy: true });
  const counts = { processed: 0, published: 0, failed: 0 };
  let failure: string | undefined;
  try {
    const settings = await prisma.automationSettings.findUnique({ where: { id: 'default' } });
    const post = await prisma.post.findFirst({
      where: { status: 'scheduled', scheduledAt: { lte: new Date() }, instagramPostId: null,
        publicationAttemptedAt: null,
        OR: [{ autopilotSlot: null }, ...(settings?.enabled ? [{ autopilotSlot: {
          gte: new Date().toISOString().slice(0, 10) + ':0',
          lt: new Date().toISOString().slice(0, 10) + ':' + settings.dailyPostLimit,
        } }] : [])] },
      include: { slides: { orderBy: { order: 'asc' } } }, orderBy: { scheduledAt: 'asc' },
    });
    if (post) {
      const claim = await prisma.post.updateMany({
        where: { id: post.id, status: 'scheduled', publicationAttemptedAt: null, instagramPostId: null },
        data: { status: 'publishing', processingStartedAt: new Date() },
      });
      if (claim.count === 1) {
        counts.processed++;
        let publicationAttempted = false;
        try {
          const blockers = findApprovalBlockers(post);
          if (blockers.length) throw new Error(blockers.join(' '));
          const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
          if (!accountId) throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
          const instagramPostId = await publishCarousel({
            instagramBusinessAccountId: accountId, caption: post.caption ?? undefined,
            slides: post.slides.map(s => ({ imageUrl: s.imageUrl! })),
          }, {
            existingContainerId: post.instagramContainerId,
            onContainerCreated: async id => {
              await prisma.post.update({ where: { id: post.id }, data: { instagramContainerId: id } });
            },
            onPublishAttempt: async () => {
              await prisma.post.update({ where: { id: post.id }, data: { publicationAttemptedAt: new Date() } });
              publicationAttempted = true;
            },
          });
          await prisma.post.update({ where: { id: post.id }, data: {
            status: 'published', instagramPostId, publishedAt: new Date(), processingStartedAt: null,
            errorMessage: null, errorStage: null, retryCount: 0, nextRetryAt: null,
          } });
          counts.published++;
        } catch (error) {
          const uncertain = error instanceof PublicationUncertainError
            || (publicationAttempted && !(error instanceof MetaRejectedError && error.status < 500));
          failure = safeError(error);
          counts.failed++;
          await prisma.post.update({ where: { id: post.id }, data: {
            status: 'error', errorStage: uncertain ? 'publish_uncertain' : 'publish',
            errorMessage: failure, processingStartedAt: null,
            publicationAttemptedAt: uncertain ? new Date() : null,
            ...(error instanceof ContainerExpiredError ? { instagramContainerId: null } : {}),
            nextRetryAt: uncertain ? null : new Date(Date.now() + 15 * 60_000),
          } });
        }
        if (counts.published) {
          // Retain source images for review/recovery. Cleanup must never change
          // a successful publication back into a publishable state.
          try { await linkCommentAutomation(post.id); }
          catch (error) {
            failure = safeError(error); counts.failed++;
            await prisma.post.update({ where: { id: post.id }, data: { errorStage: 'comment_link', errorMessage: failure } });
          }
        }
      }
    }
  } catch (error) { counts.failed++; failure = safeError(error); }
  await finishStage('publish', owner, counts, failure);
  return Response.json({ ...counts, ...(failure ? { error: failure } : {}) }, { status: counts.failed ? 503 : 200 });
}
