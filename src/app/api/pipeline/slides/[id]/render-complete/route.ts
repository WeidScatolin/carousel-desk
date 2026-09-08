import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { uploadSlideImage, deleteSlideImage } from '@/lib/storage/cloudinary';
import { isPipelineAuthorized } from '@/lib/pipeline/auth';

const bodySchema = z.object({ imageBase64: z.string().min(4).max(4_000_000), renderVersion: z.number().int().nonnegative() });
interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  if (!isPipelineAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const slide = await prisma.slide.findUnique({ where: { id } });
  if (!slide) return Response.json({ error: 'Slide not found' }, { status: 404 });
  if (slide.renderVersion !== parsed.data.renderVersion) return Response.json({ error: 'Stale render' }, { status: 409 });
  if (slide.imageUrl) return Response.json({ ok: true, imageUrl: slide.imageUrl });
  const buffer = Buffer.from(parsed.data.imageBase64, 'base64');
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return Response.json({ error: 'Expected a JPEG screenshot' }, { status: 400 });
  }
  const uploaded = await uploadSlideImage(buffer, slide.postId + '-slide-' + id + '-' + crypto.randomUUID());
  const committed = await prisma.$transaction(async tx => {
    // Lock the parent so two last-slide callbacks cannot both miss completion.
    const parent = await tx.post.updateMany({
      where: { id: slide.postId, status: 'generating', generationComplete: true },
      data: { updatedAt: new Date() },
    });
    if (parent.count !== 1) return false;
    const result = await tx.slide.updateMany({
      where: { id, renderVersion: parsed.data.renderVersion, imageUrl: null },
      data: { imageUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId, imageDeletedAt: null },
    });
    if (result.count !== 1) return false;
    const post = await tx.post.findUniqueOrThrow({ where: { id: slide.postId }, include: { slides: true } });
    if (post.slides.length === post.expectedSlideCount && post.slides.length >= 2
        && post.slides.every(s => s.imageUrl)) {
      await tx.post.update({ where: { id: post.id }, data: {
        status: 'pending_approval', processingStartedAt: null, errorMessage: null, errorStage: null, retryCount: 0,
      } });
    }
    return true;
  }).catch(async error => {
    await deleteSlideImage(uploaded.publicId).catch(() => undefined);
    throw error;
  });
  if (!committed) {
    await deleteSlideImage(uploaded.publicId).catch(() => undefined);
    return Response.json({ error: 'Render no longer belongs to an active post' }, { status: 409 });
  }
  if (slide.cloudinaryPublicId && slide.cloudinaryPublicId !== uploaded.publicId) {
    await deleteSlideImage(slide.cloudinaryPublicId).catch(() => undefined);
  }
  return Response.json({ ok: true, imageUrl: uploaded.url });
}
