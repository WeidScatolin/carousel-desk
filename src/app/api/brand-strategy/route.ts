import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { brandStrategySchema } from '@/lib/validation/brandStrategy';

export async function GET(): Promise<NextResponse> {
  const strategy = await prisma.brandStrategy.findFirst({ where: { active: true } });
  return NextResponse.json({ strategy }, { status: 200 });
}

// Single-record settings resource: updates the active BrandStrategy, or
// creates one if none exists yet. There is deliberately no separate
// create/list flow — this project runs with exactly one active strategy.
export async function PATCH(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json();
  const parsed = brandStrategySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.brandStrategy.findFirst({ where: { active: true } });

  const strategy = existing
    ? await prisma.brandStrategy.update({ where: { id: existing.id }, data: parsed.data })
    : await prisma.brandStrategy.create({ data: { ...parsed.data, active: true } });

  return NextResponse.json({ strategy }, { status: 200 });
}
