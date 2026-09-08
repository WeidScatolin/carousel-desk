import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approvePostSchema } from '@/lib/validation/kanbanActions';
import { findApprovalBlockers } from '@/lib/validation/postApproval';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = approvePostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const post = await prisma.post.findUniqueOrThrow({
    where: { id },
    include: { slides: true },
  });

  if (post.status !== 'pending_approval' || post.publicationAttemptedAt || post.instagramPostId) {
    return NextResponse.json({ error: 'Post is not awaiting approval' }, { status: 409 });
  }
  const blockers = findApprovalBlockers(post);
  if (blockers.length > 0) {
    return NextResponse.json({ error: 'Post is not ready for approval', blockers }, { status: 422 });
  }

  const claim = await prisma.post.updateMany({
    where: { id, status: 'pending_approval', publicationAttemptedAt: null, instagramPostId: null },
    data: { status: 'scheduled', scheduledAt: new Date(parsed.data.scheduledAt) },
  });

  if (claim.count !== 1) return NextResponse.json({ error: 'Post changed; reload it' }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
