import { prisma } from '@/lib/prisma';
import { regeneratePostSlides } from './regeneratePostSlides';

export async function generatePostFromTheme(themeId: string): Promise<string> {
  const theme = await prisma.theme.findUniqueOrThrow({
    where: { id: themeId },
    include: { contentBrief: { include: { leadMagnet: true } } },
  });

  if (!theme.contentBrief) {
    throw new Error(
      `generatePostFromTheme: theme ${themeId} has no ContentBrief — run discover (Fase 3 scoring) before generating a post`,
    );
  }

  const brandStrategy = await prisma.brandStrategy.findFirst({ where: { active: true } });
  if (!brandStrategy) {
    throw new Error('generatePostFromTheme: no active BrandStrategy configured');
  }

  const { contentBrief } = theme;

  const post = await prisma.post.create({
    data: {
      themeId: theme.id,
      status: 'generating',
      postGoal: contentBrief.postGoal,
      contentPillar: contentBrief.contentPillar,
      funnelStage: contentBrief.funnelStage,
      leadMagnetId: contentBrief.leadMagnetId,
    },
  });

  try {
    const { caption, ctaKeyword } = await regeneratePostSlides(post.id, theme, contentBrief, brandStrategy);

    // Stays "generating" — slides have htmlContent but no rendered image
    // yet (see regeneratePostSlides). The render-pending-slides GitHub
    // Action screenshots each one and flips this to pending_approval once
    // every slide on this post has an image.
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { caption, ctaKeyword },
    });

    return updated.id;
  } catch (error) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
