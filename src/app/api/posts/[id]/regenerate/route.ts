import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { regeneratePostSlides } from '@/lib/pipeline/regeneratePostSlides';
import { deleteSlideImage } from '@/lib/storage/cloudinary';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Not allowed once a post is scheduled/published — regenerating already
// -approved or already-live content behind the scenes would be
// surprising; the editor should reject/re-approve explicitly instead.
const BLOCKED_STATUSES = new Set(['scheduled', 'published']);

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  const post = await prisma.post.findUniqueOrThrow({
    where: { id },
    include: { slides: true, theme: { include: { contentBrief: { include: { leadMagnet: true } } } } },
  });

  if (BLOCKED_STATUSES.has(post.status)) {
    return NextResponse.json(
      { error: `Cannot regenerate a post with status "${post.status}"` },
      { status: 409 },
    );
  }

  if (!post.theme.contentBrief) {
    return NextResponse.json({ error: 'Theme has no ContentBrief' }, { status: 500 });
  }

  const brandStrategy = await prisma.brandStrategy.findFirst({ where: { active: true } });
  if (!brandStrategy) {
    return NextResponse.json({ error: 'No active BrandStrategy configured' }, { status: 500 });
  }

  await prisma.post.update({ where: { id }, data: { status: 'generating' } });

  for (const slide of post.slides) {
    if (slide.cloudinaryPublicId) {
      await deleteSlideImage(slide.cloudinaryPublicId);
    }
  }
  await prisma.slide.deleteMany({ where: { postId: id } });

  try {
    const { caption, ctaKeyword } = await regeneratePostSlides(
      id,
      post.theme,
      post.theme.contentBrief,
      brandStrategy,
    );

    const updated = await prisma.post.update({
      where: { id },
      data: { status: 'pending_approval', caption, ctaKeyword, errorMessage: null },
      include: { slides: { orderBy: { order: 'asc' } } },
    });

    return NextResponse.json({ post: updated }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.post.update({ where: { id }, data: { status: 'error', errorMessage } });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
