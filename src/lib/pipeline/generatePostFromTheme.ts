import { prisma } from '@/lib/prisma';
import { regeneratePostSlides } from './regeneratePostSlides';
import { safeError } from './state';

export async function generatePostFromTheme(themeId: string, reservedPostId?: string): Promise<string> {
  const theme = await prisma.theme.findUniqueOrThrow({
    where: { id: themeId }, include: { contentBrief: { include: { leadMagnet: true } } },
  });
  if (!theme.contentBrief) throw new Error('Theme has no ContentBrief; discover and score it first');
  const brand = await prisma.brandStrategy.findFirst({ where: { active: true } });
  if (!brand) throw new Error('No active BrandStrategy configured');
  const brief = theme.contentBrief;
  const startedAt = new Date();
  const post = reservedPostId
    ? await prisma.post.findUniqueOrThrow({ where: { id: reservedPostId } })
    : await prisma.$transaction(async (tx) => {
      const claim = await tx.theme.updateMany({ where: { id: themeId, status: 'pending' }, data: { status: 'approved' } });
      if (claim.count !== 1) throw new Error('Theme already processed; use the existing post');
      return tx.post.create({ data: { themeId, status: 'generating', processingStartedAt: startedAt,
        postGoal: brief.postGoal, contentPillar: brief.contentPillar, funnelStage: brief.funnelStage,
        leadMagnetId: brief.leadMagnetId } });
    });
  if (post.themeId !== themeId || post.status !== 'generating' || !post.processingStartedAt) {
    throw new Error('Post is not reserved for generation');
  }
  try {
    await regeneratePostSlides(post.id, theme, brief, brand, post.processingStartedAt);
    return post.id;
  } catch (error) {
    await prisma.post.updateMany({
      where: { id: post.id, status: 'generating', processingStartedAt: post.processingStartedAt },
      data: { status: 'error', errorStage: 'generation', errorMessage: safeError(error),
        nextRetryAt: new Date(Date.now() + 15 * 60_000) },
    });
    throw error;
  }
}
