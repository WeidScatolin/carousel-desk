import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rejectThemeSchema } from '@/lib/validation/kanbanActions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = rejectThemeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.theme.update({
    where: { id },
    data: { status: 'rejected', rejectionReason: parsed.data.reason },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
