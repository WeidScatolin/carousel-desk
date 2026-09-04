import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

function authorized(request: Request): boolean {
  const expected = process.env.PUBLISH_API_TOKEN;
  const provided = request.headers.get('authorization');
  if (!expected || !provided?.startsWith('Bearer ')) {
    return false;
  }
  const actual = provided.slice('Bearer '.length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

// Slides with copy but no rendered image yet — generatePostFromTheme
// writes htmlContent and leaves imageUrl null; the render-pending-slides
// GitHub Action (real Chromium, not Vercel's constrained serverless one)
// picks these up, screenshots them, and reports back via
// POST /api/pipeline/slides/[id]/render-complete.
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slides = await prisma.slide.findMany({
    where: { imageUrl: null, post: { status: 'generating' } },
    select: { id: true, postId: true, htmlContent: true },
    orderBy: { order: 'asc' },
  });

  return Response.json({ slides });
}
