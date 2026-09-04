import { NextResponse } from 'next/server';
import { composeReplyMessage, deliverCommentReply } from '@/lib/leads/deliverCommentReply';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  // The claim: only a FAILED row is eligible, and this update is the atomic
  // gate against a concurrent reprocess request re-claiming the same row.
  const claim = await prisma.commentDelivery.updateMany({
    where: { id, status: 'FAILED' },
    data: { status: 'PROCESSING' },
  });
  if (claim.count !== 1) {
    return NextResponse.json({ error: 'Delivery not found or not eligible for reprocessing' }, { status: 409 });
  }

  const delivery = await prisma.commentDelivery.findUniqueOrThrow({
    where: { id },
    include: { automation: true },
  });

  const outcome = await deliverCommentReply(
    delivery.instagramCommentId,
    composeReplyMessage(delivery.automation),
  );

  const updated = await prisma.commentDelivery.update({
    where: { id },
    data: {
      status: outcome.status,
      externalMessageId: outcome.externalMessageId,
      lastError: outcome.lastError,
      retryCount: { increment: 1 },
      deliveredAt: outcome.status === 'FAILED' ? null : new Date(),
    },
  });

  return NextResponse.json({ delivery: updated }, { status: 200 });
}
