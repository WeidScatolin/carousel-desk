import { publishCarousel } from '@/lib/instagram/publishCarousel';
import { prisma } from '@/lib/prisma';
import { deleteSlideImage } from '@/lib/storage/cloudinary';

interface PublishResult { published: boolean; }
interface ReadySlide { id: string; imageUrl: string; cloudinaryPublicId: string; }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireAccountId(): string {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accountId) throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
  return accountId;
}

function requireSlides(slides: ReadonlyArray<{ id: string; imageUrl: string | null; cloudinaryPublicId: string | null }>): ReadySlide[] {
  return slides.map((slide) => {
    if (!slide.imageUrl || !slide.cloudinaryPublicId) {
      throw new Error(`Slide ${slide.id} is missing its published image metadata`);
    }
    return { id: slide.id, imageUrl: slide.imageUrl, cloudinaryPublicId: slide.cloudinaryPublicId };
  });
}

async function cleanPublishedSlides(slides: ReadonlyArray<ReadySlide>): Promise<string[]> {
  const failures: string[] = [];
  for (const slide of slides) {
    try {
      await deleteSlideImage(slide.cloudinaryPublicId);
      await prisma.slide.update({ where: { id: slide.id }, data: { imageUrl: null, imageDeletedAt: new Date() } });
    } catch (error) {
      failures.push(`Cloudinary cleanup failed for slide ${slide.id}: ${errorMessage(error)}`);
    }
  }
  return failures;
}

async function processPost(post: { id: string; slides: ReadonlyArray<{ id: string; imageUrl: string | null; cloudinaryPublicId: string | null }> }): Promise<PublishResult> {
  let slides: ReadySlide[];
  let instagramPostId: string;
  try {
    slides = requireSlides(post.slides);
    instagramPostId = await publishCarousel({
      instagramBusinessAccountId: requireAccountId(),
      slides: slides.map(({ imageUrl }) => ({ imageUrl })),
    });
  } catch (error) {
    await prisma.post.update({ where: { id: post.id }, data: { status: 'error', errorMessage: errorMessage(error) } });
    return { published: false };
  }
  await prisma.post.update({
    where: { id: post.id },
    data: { status: 'published', publishedAt: new Date(), instagramPostId, errorMessage: null },
  });
  const cleanupFailures = await cleanPublishedSlides(slides);
  if (cleanupFailures.length > 0) {
    await prisma.post.update({ where: { id: post.id }, data: { errorMessage: cleanupFailures.join('; ') } });
  }
  return { published: true };
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.PUBLISH_API_TOKEN;
  const authorization = request.headers.get('authorization');
  if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const posts = await prisma.post.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    include: { slides: { orderBy: { order: 'asc' } } },
  });
  const results: PublishResult[] = [];
  for (const post of posts) results.push(await processPost(post));
  const published = results.filter((result) => result.published).length;
  return Response.json({ processed: results.length, published, failed: results.length - published });
}
