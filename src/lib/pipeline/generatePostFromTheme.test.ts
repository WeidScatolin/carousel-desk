import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../ai/writeCarouselCopy', () => ({ writeCarouselCopy: vi.fn() }));
vi.mock('../ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn() }));
vi.mock('../images/resolveThemeImage', () => ({ resolveThemeImage: vi.fn() }));
vi.mock('../render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));
vi.mock('../storage/cloudinary', () => ({ uploadSlideImage: vi.fn() }));

import { writeCarouselCopy, type CarouselCopy, type SlideCopyItem } from '../ai/writeCarouselCopy';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { resolveThemeImage } from '../images/resolveThemeImage';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';
import { generatePostFromTheme } from './generatePostFromTheme';
import { prisma } from '@/lib/prisma';

function buildSlide(overrides: Partial<SlideCopyItem> = {}): SlideCopyItem {
  return {
    role: 'problem',
    template: 'editorial_text',
    headline: 'O atendimento manual não escala',
    body: 'Times pequenos não conseguem responder tudo.',
    accentPhrase: 'não escala',
    kicker: 'Radar',
    sourceLabel: null,
    visualType: 'typography_only',
    visualInstructions: null,
    ...overrides,
  };
}

const validCopy: CarouselCopy = {
  hookVariants: ['a', 'b', 'c'],
  hook: 'a',
  caption: 'Legenda de teste',
  ctaKeyword: null,
  slides: [
    buildSlide({ role: 'cover', template: 'cover_cinematic', visualType: 'main_image' }),
    buildSlide(),
  ],
};

describe('generatePostFromTheme', () => {
  let themeId: string;
  let brandStrategyId: string;

  beforeEach(async () => {
    vi.mocked(writeCarouselCopy).mockReset();
    vi.mocked(generateSlideHtml).mockReset();
    vi.mocked(resolveThemeImage).mockReset().mockResolvedValue(null);
    vi.mocked(renderSlideToImage).mockReset();
    vi.mocked(uploadSlideImage).mockReset();

    const theme = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/news',
        summary: 'resumo de teste',
        headlineSuggestion: 'Tema de teste',
        articleBody: 'Corpo real do artigo de teste.',
        articleFacts: ['Um fato real.'],
        hasSufficientEvidence: true,
        status: 'approved',
      },
    });
    themeId = theme.id;

    const brandStrategy = await prisma.brandStrategy.create({
      data: {
        name: 'Estratégia de teste',
        positioning: 'pos',
        targetAudience: 'aud',
        coreProblem: 'problem',
        promise: 'promise',
        offerDescription: 'offer',
        tone: 'tone',
        defaultCtaKeyword: 'MAPA',
        instagramHandle: '@teste',
        active: true,
      },
    });
    brandStrategyId = brandStrategy.id;

    await prisma.contentBrief.create({
      data: {
        themeId,
        contentPillar: 'radar',
        funnelStage: 'awareness',
        postGoal: 'follow',
        targetPain: 'dor',
        businessApplication: 'aplicação',
        hook: 'gancho',
        hookVariants: ['a', 'b', 'c'],
        angle: 'ângulo',
        strategicRationale: 'racional',
        audienceFitScore: 80,
        businessImpactScore: 70,
        hookPotentialScore: 60,
        evidenceQualityScore: 90,
        offerBridgeScore: 50,
        noveltyScore: 40,
        totalScore: 69,
      },
    });
  });

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId } } });
    await prisma.post.deleteMany({ where: { themeId } });
    await prisma.contentBrief.deleteMany({ where: { themeId } });
    await prisma.theme.delete({ where: { id: themeId } });
    await prisma.brandStrategy.delete({ where: { id: brandStrategyId } });
  });

  test('throws when the theme has no ContentBrief yet', async () => {
    const bareTheme = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/no-brief',
        summary: 'resumo',
        headlineSuggestion: 'Sem brief',
        status: 'approved',
      },
    });

    await expect(generatePostFromTheme(bareTheme.id)).rejects.toThrow('has no ContentBrief');

    await prisma.theme.delete({ where: { id: bareTheme.id } });
  });

  test('creates a post with generated slides and marks it pending_approval', async () => {
    vi.mocked(writeCarouselCopy).mockResolvedValue(validCopy);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({
      url: 'https://cloudinary.test/img.png',
      publicId: 'test-public-id',
    });

    const postId = await generatePostFromTheme(themeId);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { slides: { orderBy: { order: 'asc' } } },
    });

    expect(post.status).toBe('pending_approval');
    expect(post.caption).toBe('Legenda de teste');
    expect(post.postGoal).toBe('follow');
    expect(post.contentPillar).toBe('radar');
    expect(post.funnelStage).toBe('awareness');
    expect(post.slides).toHaveLength(2);
    expect(post.slides[0]?.role).toBe('cover');
    expect(post.slides[0]?.accentPhrase).toBe('não escala');
    expect(post.slides[0]?.kicker).toBe('Radar');
    expect(post.slides[0]?.imageUrl).toBe('https://cloudinary.test/img.png');
  });

  test('resolves the theme image only for slides whose visualType is main_image', async () => {
    vi.mocked(writeCarouselCopy).mockResolvedValue({
      ...validCopy,
      slides: [
        buildSlide({ role: 'cover', template: 'cover_cinematic', visualType: 'main_image' }),
        buildSlide({ role: 'framework', template: 'framework', visualType: 'typography_only' }),
      ],
    });
    vi.mocked(resolveThemeImage).mockResolvedValue({
      url: 'https://example.com/photo.jpg',
      source: 'scraped',
      sourceImageUrl: 'https://example.com/photo.jpg',
    });
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({
      url: 'https://cloudinary.test/img.png',
      publicId: 'test-public-id',
    });

    const postId = await generatePostFromTheme(themeId);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { slides: { orderBy: { order: 'asc' } } },
    });

    expect(generateSlideHtml).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ template: 'cover_cinematic', slideNumber: 1, totalSlides: 2 }),
      'https://example.com/photo.jpg',
    );
    expect(generateSlideHtml).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ template: 'framework', slideNumber: 2, totalSlides: 2 }),
      undefined,
    );
    expect(post.slides[0]?.imageSource).toBe('scraped');
    expect(post.slides[0]?.sourceImageUrl).toBe('https://example.com/photo.jpg');
    expect(post.slides[1]?.imageSource).toBe('stock');
    expect(post.slides[1]?.sourceImageUrl).toBeNull();
  });

  test('marks the post as error when copy generation fails', async () => {
    vi.mocked(writeCarouselCopy).mockRejectedValue(new Error('provider unavailable'));

    await expect(generatePostFromTheme(themeId)).rejects.toThrow('provider unavailable');

    const posts = await prisma.post.findMany({ where: { themeId } });

    expect(posts).toHaveLength(1);
    expect(posts[0]?.status).toBe('error');
    expect(posts[0]?.errorMessage).toBe('provider unavailable');
  });
});
