import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateCampaignSchema } from '@/lib/validation/campaign';
import { findCampaignActivationBlockers } from '@/lib/validation/campaignActivation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updateCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.leadMagnetCampaign.findUniqueOrThrow({
    where: { id },
    include: { post: true },
  });

  if (parsed.data.status === 'ACTIVE') {
    const merged = { ...campaign, ...parsed.data };
    const blockers = findCampaignActivationBlockers(merged, campaign.post.status);
    if (blockers.length > 0) {
      return NextResponse.json({ error: 'Campaign is not ready to activate', blockers }, { status: 422 });
    }
  }

  const updated = await prisma.leadMagnetCampaign.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ campaign: updated }, { status: 200 });
}
