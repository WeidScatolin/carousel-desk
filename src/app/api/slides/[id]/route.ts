import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateSlideSchema } from '@/lib/validation/kanbanActions';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';
import type { SlideCopy } from '@/lib/ai/writeCopy';
import { renderSlideToImage } from '@/lib/render/renderSlideToImage';
import { uploadSlideImage, deleteSlideImage } from '@/lib/storage/cloudinary';
import type { SlideTemplate } from '@/generated/prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SUPPORTED_EDIT_TEMPLATES = new Set<SlideCopy['template']>(['cover', 'evidence', 'framework']);

function isSupportedEditTemplate(template: SlideTemplate): template is SlideCopy['template'] {
  return SUPPORTED_EDIT_TEMPLATES.has(template as SlideCopy['template']);
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updateSlideSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slide = await prisma.slide.findUniqueOrThrow({ where: { id } });

  if (!isSupportedEditTemplate(slide.template)) {
    return NextResponse.json(
      { error: `Editing slides with template "${slide.template}" is not supported yet` },
      { status: 400 },
    );
  }

  const html = await generateSlideHtml({
    template: slide.template,
    headline: parsed.data.headline,
    body: parsed.data.body,
  });
  const imageBuffer = await renderSlideToImage(html);

  if (slide.cloudinaryPublicId) {
    await deleteSlideImage(slide.cloudinaryPublicId);
  }

  const uploaded = await uploadSlideImage(imageBuffer, `${slide.postId}-slide-${slide.order}-${Date.now()}`);

  const updated = await prisma.slide.update({
    where: { id },
    data: {
      htmlContent: html,
      imageUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
    },
  });

  return NextResponse.json({ slide: updated }, { status: 200 });
}
