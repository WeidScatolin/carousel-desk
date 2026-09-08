import { prisma } from '@/lib/prisma';
import { isPipelineAuthorized } from '@/lib/pipeline/auth';

export async function GET(request: Request): Promise<Response> {
  if (!isPipelineAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const slides = await prisma.slide.findMany({
    where: { imageUrl: null, post: { status: 'generating', generationComplete: true } },
    select: { id: true, postId: true, htmlContent: true, renderVersion: true },
    orderBy: [{ post: { createdAt: 'asc' } }, { order: 'asc' }],
    take: 30,
  });
  return Response.json({ slides });
}
