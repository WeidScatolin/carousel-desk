import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const commentEvents = await prisma.commentLeadEvent.findMany({
    where: { campaignId: id },
    orderBy: { receivedAt: 'desc' },
  });
  return NextResponse.json({ commentEvents }, { status: 200 });
}
