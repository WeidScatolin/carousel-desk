import { prisma } from '@/lib/prisma';
import { writeCopy } from '../ai/writeCopy';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { resolveThemeImage } from '../images/resolveThemeImage';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';

const TEMPLATES_WITH_IMAGE = new Set(['cover', 'evidence']);

export async function generatePostFromTheme(themeId: string): Promise<string> {
  const theme = await prisma.theme.findUniqueOrThrow({ where: { id: themeId } });

  const post = await prisma.post.create({
    data: { themeId: theme.id, status: 'generating' },
  });

  try {
    const slidesCopy = await writeCopy({
      headlineSuggestion: theme.headlineSuggestion,
      summary: theme.summary,
    });

    const themeImage = await resolveThemeImage({
      headlineSuggestion: theme.headlineSuggestion,
      referenceImageUrls: theme.referenceImageUrls,
    });

    for (const [index, slideCopy] of slidesCopy.entries()) {
      const usesImage = TEMPLATES_WITH_IMAGE.has(slideCopy.template);
      const slideImage = usesImage ? themeImage : null;

      const html = await generateSlideHtml(slideCopy, slideImage?.url);
      const imageBuffer = await renderSlideToImage(html);
      const publicId = `${post.id}-slide-${index}`;
      const uploaded = await uploadSlideImage(imageBuffer, publicId);

      await prisma.slide.create({
        data: {
          postId: post.id,
          order: index,
          template: slideCopy.template,
          htmlContent: html,
          imageUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          imageSource: slideImage?.source ?? 'stock',
          sourceImageUrl: slideImage?.sourceImageUrl ?? null,
        },
      });
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'pending_approval' },
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
