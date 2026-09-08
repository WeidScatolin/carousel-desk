import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { regeneratePostSlides } from '@/lib/pipeline/regeneratePostSlides';
import { safeError } from '@/lib/pipeline/state';
import { deleteSlideImage } from '@/lib/storage/cloudinary';

export const maxDuration = 300;
interface RouteParams { params: Promise<{ id: string }> }
const EDITABLE_STATUSES = ['pending_approval', 'error', 'rejected'];

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const post = await prisma.post.findUniqueOrThrow({
    where: { id },
    include: { slides: true, theme: { include: { contentBrief: { include: { leadMagnet: true } } } } },
  });
  if (!EDITABLE_STATUSES.includes(post.status) || post.publicationAttemptedAt || post.instagramPostId) {
    return NextResponse.json({ error: 'Post is busy, published or has a publication requiring review' }, { status: 409 });
  }
  if (!post.theme.contentBrief) return NextResponse.json({ error: 'Theme has no ContentBrief' }, { status: 422 });
  const brand = await prisma.brandStrategy.findFirst({ where: { active: true } });
  if (!brand) return NextResponse.json({ error: 'No active BrandStrategy configured' }, { status: 422 });
  const startedAt = new Date();
  const claim = await prisma.post.updateMany({
    where: { id, status: post.status, publicationAttemptedAt: null, instagramPostId: null },
    data: { status: 'generating', generationComplete: false, processingStartedAt: startedAt,
      errorMessage: null, errorStage: null, nextRetryAt: null, retryCount: 0, instagramContainerId: null },
  });
  if (claim.count !== 1) return NextResponse.json({ error: 'Post changed; reload it' }, { status: 409 });
  try {
    await regeneratePostSlides(id, post.theme, post.theme.contentBrief, brand, startedAt);
  } catch (error) {
    const message = safeError(error);
    await prisma.post.updateMany({
      where: { id, status: 'generating', processingStartedAt: startedAt },
      data: { status: 'error', errorStage: 'generation', errorMessage: message,
        nextRetryAt: new Date(Date.now() + 15 * 60_000) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
  // Old assets remain available until new HTML and copy have committed.
  await Promise.allSettled(post.slides.filter(s => s.cloudinaryPublicId).map(s => deleteSlideImage(s.cloudinaryPublicId!)));
  const updated = await prisma.post.findUniqueOrThrow({ where: { id }, include: { slides: { orderBy: { order: 'asc' } } } });
  return NextResponse.json({ post: updated });
}
