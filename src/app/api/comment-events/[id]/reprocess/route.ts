import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processCommentEvent } from '@/lib/pipeline/processCommentEvent';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const event = await prisma.commentLeadEvent.findUniqueOrThrow({ where: { id } });

  if (event.deliveryStatus !== 'FAILED') {
    return NextResponse.json(
      { error: 'Only events with deliveryStatus FAILED can be reprocessed' },
      { status: 409 },
    );
  }

  const result = await processCommentEvent({
    instagramCommentId: event.instagramCommentId,
    instagramMediaId: event.instagramMediaId,
    instagramUserId: event.instagramUserId ?? undefined,
    instagramUsername: event.instagramUsername ?? undefined,
    originalComment: event.originalComment,
  });

  return NextResponse.json({ commentEvent: result }, { status: 200 });
}
