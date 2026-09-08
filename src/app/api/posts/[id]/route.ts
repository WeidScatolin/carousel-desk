import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updatePostSchema } from '@/lib/validation/kanbanActions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updatePostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const claim = await prisma.post.updateMany({
    where: { id, status: { in: ['pending_approval', 'error', 'rejected'] }, publicationAttemptedAt: null, instagramPostId: null },
    data: { ...parsed.data, instagramContainerId: null },
  });
  if (!claim.count) return NextResponse.json({ error: 'Post cannot be edited in its current state' }, { status: 409 });
  const post = await prisma.post.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ post }, { status: 200 });
}
