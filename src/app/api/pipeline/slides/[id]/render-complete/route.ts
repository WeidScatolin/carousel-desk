import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { uploadSlideImage } from '@/lib/storage/cloudinary';

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

const bodySchema = z.object({ imageBase64: z.string().trim().min(1) });

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Called by the render-pending-slides GitHub Action once it has
// screenshotted a slide with a real (non-serverless-constrained)
// Chromium. Uploads to Cloudinary here rather than from the Action, so
// Cloudinary credentials only ever live in Vercel's env, not in a second
// place (GitHub secrets).
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slide = await prisma.slide.findUnique({ where: { id }, select: { id: true, postId: true } });
  if (!slide) {
    return Response.json({ error: 'Slide not found' }, { status: 404 });
  }

  const buffer = Buffer.from(parsed.data.imageBase64, 'base64');
  const uploaded = await uploadSlideImage(buffer, `${slide.postId}-slide-${slide.id}-${Date.now()}`);

  await prisma.slide.update({
    where: { id: slide.id },
    data: { imageUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId },
  });

  const remaining = await prisma.slide.count({ where: { postId: slide.postId, imageUrl: null } });
  if (remaining === 0) {
    await prisma.post.updateMany({
      where: { id: slide.postId, status: 'generating' },
      data: { status: 'pending_approval' },
    });
  }

  return Response.json({ ok: true, imageUrl: uploaded.url });
}
