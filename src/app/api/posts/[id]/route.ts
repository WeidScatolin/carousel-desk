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

  const post = await prisma.post.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ post }, { status: 200 });
}
