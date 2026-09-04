import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { leadMagnetSchema } from '@/lib/validation/brandStrategy';

export async function GET(): Promise<NextResponse> {
  const leadMagnets = await prisma.leadMagnet.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ leadMagnets }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json();
  const parsed = leadMagnetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const leadMagnet = await prisma.leadMagnet.create({
    data: { ...parsed.data, active: parsed.data.active ?? true },
  });

  return NextResponse.json({ leadMagnet }, { status: 201 });
}
