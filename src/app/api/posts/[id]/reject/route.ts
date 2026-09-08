import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rejectPostSchema } from '@/lib/validation/kanbanActions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = rejectPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const post = await prisma.post.findUniqueOrThrow({ where: { id } });

  const changed = await prisma.$transaction(async tx => {
    const claim = await tx.post.updateMany({
      where: { id, status: { in: ['generating', 'pending_approval', 'scheduled', 'error', 'rejected'] },
        publicationAttemptedAt: null, instagramPostId: null },
      data: { status: 'rejected', rejectionReason: parsed.data.reason, nextRetryAt: null },
    });
    if (!claim.count) return false;
    await tx.theme.update({ where: { id: post.themeId }, data: { status: 'pending' } });
    return true;
  });
  if (!changed) return NextResponse.json({ error: 'Published or uncertain posts cannot be rejected' }, { status: 409 });

  return NextResponse.json({ ok: true }, { status: 200 });
}
