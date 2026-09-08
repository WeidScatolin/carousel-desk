import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateSlideSchema } from '@/lib/validation/kanbanActions';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const parsed = updateSlideSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const slide = await prisma.slide.findUniqueOrThrow({ where: { id }, include: { post: true } });
  if (!['pending_approval', 'error', 'rejected'].includes(slide.post.status)
      || slide.post.publicationAttemptedAt || slide.post.instagramPostId) {
    return NextResponse.json({ error: 'Post cannot be edited in its current state' }, { status: 409 });
  }
  const totalSlides = await prisma.slide.count({ where: { postId: slide.postId } });
  const brand = await prisma.brandStrategy.findFirst({ where: { active: true } });
  const accentPhrase = parsed.data.accentPhrase !== undefined ? parsed.data.accentPhrase : slide.accentPhrase;
  const html = await generateSlideHtml({
    template: slide.template, headline: parsed.data.headline, body: parsed.data.body,
    accentPhrase, kicker: slide.kicker, sourceLabel: slide.sourceLabel,
    slideNumber: slide.order + 1, totalSlides, instagramHandle: brand?.instagramHandle,
  }, slide.sourceImageUrl);
  const updated = await prisma.$transaction(async tx => {
    const claim = await tx.post.updateMany({
      where: { id: slide.postId, status: slide.post.status, publicationAttemptedAt: null, instagramPostId: null },
      data: { status: 'generating', generationComplete: true, expectedSlideCount: totalSlides,
        processingStartedAt: new Date(), errorMessage: null, errorStage: null, instagramContainerId: null },
    });
    if (claim.count !== 1) return null;
    return tx.slide.update({
      where: { id },
      data: { headline: parsed.data.headline, body: parsed.data.body, htmlContent: html,
        imageUrl: null, accentPhrase, renderVersion: { increment: 1 } },
    });
  });
  if (!updated) return NextResponse.json({ error: 'Post changed; reload it' }, { status: 409 });
  return NextResponse.json({ slide: updated }, { status: 202 });
}
