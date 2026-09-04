import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const deliveries = await prisma.commentDelivery.findMany({
    where: { automationId: id },
    orderBy: { discoveredAt: 'desc' },
  });
  return NextResponse.json({ deliveries }, { status: 200 });
}
