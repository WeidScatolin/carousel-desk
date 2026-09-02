import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approvePostSchema } from '@/lib/validation/kanbanActions';

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

  await prisma.post.update({
    where: { id },
    data: { status: 'scheduled', scheduledAt: new Date(parsed.data.scheduledAt) },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
