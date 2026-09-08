import { prisma } from '@/lib/prisma';
import { isPipelineAuthorized } from '@/lib/pipeline/auth';
import { safeError } from '@/lib/pipeline/state';
import { z } from 'zod';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isPipelineAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = z.object({ renderVersion: z.number().int().nonnegative(), error: z.string().max(800) }).safeParse(await request.json());
  if (!body.success) return Response.json({ error: 'Invalid failure report' }, { status: 400 });
  const slide = await prisma.slide.findUnique({ where: { id } });
  if (slide && !slide.imageUrl && slide.renderVersion === body.data.renderVersion) {
    await prisma.post.updateMany({
      where: { id: slide.postId, status: 'generating', generationComplete: true },
      data: { status: 'error', errorStage: 'render', errorMessage: safeError(body.data.error),
        nextRetryAt: new Date(Date.now() + 15 * 60_000) },
    });
  }
  return Response.json({ ok: true });
}
