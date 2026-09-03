import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateSlideSchema } from '@/lib/validation/kanbanActions';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';
import { renderSlideToImage } from '@/lib/render/renderSlideToImage';
import { uploadSlideImage, deleteSlideImage } from '@/lib/storage/cloudinary';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updateSlideSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slide = await prisma.slide.findUniqueOrThrow({ where: { id } });
  const totalSlides = await prisma.slide.count({ where: { postId: slide.postId } });

  // Regenerating a slide's text must not silently drop its composition:
  // the original background photo (sourceImageUrl), kicker, sourceLabel
  // and its position in the carousel all carry over unchanged.
  // accentPhrase carries over too unless the caller explicitly sent a new
  // value (including null, to clear it) — `undefined` means "untouched".
  const accentPhrase = parsed.data.accentPhrase !== undefined ? parsed.data.accentPhrase : slide.accentPhrase;

  const html = await generateSlideHtml(
    {
      template: slide.template,
      headline: parsed.data.headline,
      body: parsed.data.body,
      accentPhrase,
      kicker: slide.kicker,
      sourceLabel: slide.sourceLabel,
      slideNumber: slide.order + 1,
      totalSlides,
    },
    slide.sourceImageUrl,
  );
  const imageBuffer = await renderSlideToImage(html);

  if (slide.cloudinaryPublicId) {
    await deleteSlideImage(slide.cloudinaryPublicId);
  }

  const uploaded = await uploadSlideImage(imageBuffer, `${slide.postId}-slide-${slide.order}-${Date.now()}`);

  const updated = await prisma.slide.update({
    where: { id },
    data: {
      headline: parsed.data.headline,
      body: parsed.data.body,
      htmlContent: html,
      imageUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
      accentPhrase,
    },
  });

  return NextResponse.json({ slide: updated }, { status: 200 });
}
