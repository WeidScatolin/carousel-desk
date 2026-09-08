import { prisma } from '@/lib/prisma';
import type { BrandStrategy, ContentBrief, LeadMagnet, Theme, Prisma } from '@/generated/prisma/client';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { writeCarouselCopy } from '../ai/writeCarouselCopy';
import { resolveThemeImage } from '../images/resolveThemeImage';

export interface ThemeForGeneration
  extends Pick<Theme, 'headlineSuggestion' | 'summary' | 'articleBody' | 'articleFacts' | 'referenceImageUrls'> {}

export interface ContentBriefForGeneration
  extends Pick<
    ContentBrief,
    'contentPillar' | 'funnelStage' | 'postGoal' | 'targetPain' | 'businessApplication' | 'angle' | 'hook' | 'hookVariants' | 'leadMagnetId'
  > {
  leadMagnet: LeadMagnet | null;
}

export interface RegeneratedPostCopy {
  caption: string;
  ctaKeyword: string | null;
}

// Prepare the complete carousel before exposing slides to the render worker.
export async function regeneratePostSlides(
  postId: string,
  theme: ThemeForGeneration,
  contentBrief: ContentBriefForGeneration,
  brandStrategy: BrandStrategy,
  generationStartedAt: Date,
): Promise<RegeneratedPostCopy> {
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

  if (contentBrief.postGoal === 'comment_dm' && !copy.ctaKeyword) {
    throw new Error('regeneratePostSlides: postGoal is comment_dm but the copy has no ctaKeyword');
  }

  const themeImage = await resolveThemeImage({
    headlineSuggestion: theme.headlineSuggestion,
    referenceImageUrls: theme.referenceImageUrls,
  });

  const totalSlides = copy.slides.length;

  const slides: Prisma.SlideCreateManyInput[] = [];
  for (const [index, slideCopy] of copy.slides.entries()) {
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

    // Rendering (Playwright screenshot) and the Cloudinary upload that
    // follows it don't happen here — a Vercel serverless function is a
    // poor place to run a real headless Chromium (@sparticuz/chromium's
    // constrained build has repeatedly failed to reliably screenshot in
    // production). htmlContent already has fonts embedded as base64
    // (see loadFonts.ts, used inside generateSlideHtml), so it's fully
    // self-contained; the render-pending-slides GitHub Action screenshots
    // it with a full, ordinary Chromium and fills in imageUrl afterwards.
    slides.push({
        postId,
        order: index,
        template: slideCopy.template,
        role: slideCopy.role,
        headline: slideCopy.headline,
        body: slideCopy.body,
        htmlContent: html,
        imageUrl: null,
        cloudinaryPublicId: null,
        imageSource: slideImage?.source ?? 'stock',
        sourceImageUrl: slideImage?.sourceImageUrl ?? null,
        accentPhrase: slideCopy.accentPhrase,
        kicker: slideCopy.kicker,
        sourceLabel: slideCopy.sourceLabel,
        visualType: slideCopy.visualType,
        visualInstructions: slideCopy.visualInstructions,
    });
  }

  // Commit all slides together. The timestamp prevents a timed-out invocation
  // from overwriting a newer generation, and the worker never sees a partial set.
  await prisma.$transaction(async (tx) => {
    const claim = await tx.post.updateMany({
      where: { id: postId, status: 'generating', processingStartedAt: generationStartedAt },
      data: { caption: copy.caption, ctaKeyword: copy.ctaKeyword,
        generationComplete: true, expectedSlideCount: slides.length,
        errorMessage: null, errorStage: null, nextRetryAt: null },
    });
    if (claim.count !== 1) throw new Error('Generation superseded by another operation');
    await tx.slide.deleteMany({ where: { postId } });
    await tx.slide.createMany({ data: slides });
  });

  // A CommentAutomation is no longer auto-created here — per the current
  // comment-polling design, automations are configured manually in
  // /admin/automations against an already-published post (its
  // instagramMediaId only exists once that's true).
  return { caption: copy.caption, ctaKeyword: copy.ctaKeyword };
}
