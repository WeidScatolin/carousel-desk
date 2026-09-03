import { prisma } from '@/lib/prisma';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { writeCarouselCopy } from '../ai/writeCarouselCopy';
import { resolveThemeImage } from '../images/resolveThemeImage';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';

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
    const copy = await writeCarouselCopy(
      {
        headline: theme.headlineSuggestion,
        articleBody: theme.articleBody ?? theme.summary,
        articleFacts: theme.articleFacts,
      },
      {
        contentPillar: contentBrief.contentPillar,
        funnelStage: contentBrief.funnelStage,
        postGoal: contentBrief.postGoal,
        targetPain: contentBrief.targetPain,
        businessApplication: contentBrief.businessApplication,
        angle: contentBrief.angle,
        hook: contentBrief.hook,
        hookVariants: contentBrief.hookVariants,
      },
      {
        positioning: brandStrategy.positioning,
        targetAudience: brandStrategy.targetAudience,
        promise: brandStrategy.promise,
        tone: brandStrategy.tone,
        instagramHandle: brandStrategy.instagramHandle,
      },
      contentBrief.leadMagnet
        ? {
            ctaKeyword: contentBrief.leadMagnet.ctaKeyword,
            name: contentBrief.leadMagnet.name,
            description: contentBrief.leadMagnet.description,
            qualificationQuestion: contentBrief.leadMagnet.qualificationQuestion,
          }
        : null,
    );

    const themeImage = await resolveThemeImage({
      headlineSuggestion: theme.headlineSuggestion,
      referenceImageUrls: theme.referenceImageUrls,
    });

    const totalSlides = copy.slides.length;

    for (const [index, slideCopy] of copy.slides.entries()) {
      // Each slide picks its own visual — only "main_image" slides get
      // the theme's photo; diagram/mockup/screenshot/data/typography_only
      // slides never do, so the same photo doesn't repeat on every slide.
      const usesImage = slideCopy.visualType === 'main_image';
      const slideImage = usesImage ? themeImage : null;

      const html = await generateSlideHtml(
        {
          template: slideCopy.template,
          headline: slideCopy.headline,
          body: slideCopy.body,
          accentPhrase: slideCopy.accentPhrase,
          kicker: slideCopy.kicker,
          sourceLabel: slideCopy.sourceLabel,
          slideNumber: index + 1,
          totalSlides,
          instagramHandle: brandStrategy.instagramHandle,
        },
        slideImage?.url,
      );
      const imageBuffer = await renderSlideToImage(html);
      const publicId = `${post.id}-slide-${index}`;
      const uploaded = await uploadSlideImage(imageBuffer, publicId);

      await prisma.slide.create({
        data: {
          postId: post.id,
          order: index,
          template: slideCopy.template,
          role: slideCopy.role,
          htmlContent: html,
          imageUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          imageSource: slideImage?.source ?? 'stock',
          sourceImageUrl: slideImage?.sourceImageUrl ?? null,
          accentPhrase: slideCopy.accentPhrase,
          kicker: slideCopy.kicker,
          sourceLabel: slideCopy.sourceLabel,
          visualType: slideCopy.visualType,
          visualInstructions: slideCopy.visualInstructions,
        },
      });
    }

    if (contentBrief.postGoal === 'comment_dm') {
      if (!copy.ctaKeyword) {
        throw new Error('generatePostFromTheme: postGoal is comment_dm but the copy has no ctaKeyword');
      }
      if (!contentBrief.leadMagnet) {
        throw new Error('generatePostFromTheme: postGoal is comment_dm but the theme has no linked LeadMagnet');
      }
      await prisma.leadMagnetCampaign.create({
        data: {
          carouselId: post.id,
          leadMagnetId: contentBrief.leadMagnet.id,
          name: `${contentBrief.leadMagnet.name} — ${theme.headlineSuggestion}`,
          keyword: copy.ctaKeyword,
          assetName: contentBrief.leadMagnet.name,
          assetUrl: contentBrief.leadMagnet.deliveryUrl,
          deliveryMessage: `Oi! Aqui está o ${contentBrief.leadMagnet.name} que você pediu:\n\n${contentBrief.leadMagnet.deliveryUrl}`,
          qualificationQuestion: contentBrief.leadMagnet.qualificationQuestion,
          status: 'DRAFT',
        },
      });
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'pending_approval',
        caption: copy.caption,
        ctaKeyword: copy.ctaKeyword,
      },
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
