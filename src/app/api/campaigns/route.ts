import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(): Promise<NextResponse> {
  const campaigns = await prisma.leadMagnetCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { post: { include: { theme: true } }, leadMagnet: true },
  });
  return NextResponse.json({ campaigns }, { status: 200 });
}
