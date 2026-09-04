import { prisma } from '@/lib/prisma';
import type { BrandStrategy, ContentBrief, LeadMagnet, Theme } from '@/generated/prisma/client';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { writeCarouselCopy } from '../ai/writeCarouselCopy';
import { resolveThemeImage } from '../images/resolveThemeImage';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';

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

// Shared by generatePostFromTheme (brand-new post) and the "regenerate
// whole carousel" dashboard action (existing post, slides cleared first
// by the caller). Writes fresh copy, renders every slide, and — when the
// brief's postGoal is comment_dm — upserts the LeadMagnetCampaign rather
// than creating it: a regenerate refreshes the keyword/message/name but
// never touches an already-ACTIVE campaign's status, counters, or
// instagramMediaId, so re-running copy generation can never wipe out
// real comment/lead tracking.
export async function regeneratePostSlides(
  postId: string,
  theme: ThemeForGeneration,
  contentBrief: ContentBriefForGeneration,
  brandStrategy: BrandStrategy,
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

  const themeImage = await resolveThemeImage({
    headlineSuggestion: theme.headlineSuggestion,
    referenceImageUrls: theme.referenceImageUrls,
  });

  const totalSlides = copy.slides.length;

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
    const imageBuffer = await renderSlideToImage(html);
    const publicId = `${postId}-slide-${index}-${Date.now()}`;
    const uploaded = await uploadSlideImage(imageBuffer, publicId);

    await prisma.slide.create({
      data: {
        postId,
        order: index,
        template: slideCopy.template,
        role: slideCopy.role,
        headline: slideCopy.headline,
        body: slideCopy.body,
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

  if (contentBrief.postGoal === 'comment_dm' && !copy.ctaKeyword) {
    throw new Error('regeneratePostSlides: postGoal is comment_dm but the copy has no ctaKeyword');
  }

  // A CommentAutomation is no longer auto-created here — per the current
  // comment-polling design, automations are configured manually in
  // /admin/automations against an already-published post (its
  // instagramMediaId only exists once that's true).
  return { caption: copy.caption, ctaKeyword: copy.ctaKeyword };
}
