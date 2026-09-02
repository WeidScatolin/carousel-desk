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

  await prisma.$transaction([
    prisma.post.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: parsed.data.reason },
    }),
    prisma.theme.update({ where: { id: post.themeId }, data: { status: 'pending' } }),
  ]);

  return NextResponse.json({ ok: true }, { status: 200 });
}
