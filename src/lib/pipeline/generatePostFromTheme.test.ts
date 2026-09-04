import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../ai/writeCarouselCopy', () => ({ writeCarouselCopy: vi.fn() }));
vi.mock('../ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn() }));
vi.mock('../images/resolveThemeImage', () => ({ resolveThemeImage: vi.fn() }));

import { writeCarouselCopy, type CarouselCopy, type SlideCopyItem } from '../ai/writeCarouselCopy';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { resolveThemeImage } from '../images/resolveThemeImage';
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

  test('creates a post with generated slides, still generating (rendering happens out-of-band)', async () => {
    vi.mocked(writeCarouselCopy).mockResolvedValue(validCopy);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');

    const postId = await generatePostFromTheme(themeId);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { slides: { orderBy: { order: 'asc' } } },
    });

    expect(post.status).toBe('generating');
    expect(post.caption).toBe('Legenda de teste');
    expect(post.postGoal).toBe('follow');
    expect(post.contentPillar).toBe('radar');
    expect(post.funnelStage).toBe('awareness');
    expect(post.slides).toHaveLength(2);
    expect(post.slides[0]?.role).toBe('cover');
    expect(post.slides[0]?.accentPhrase).toBe('não escala');
    expect(post.slides[0]?.kicker).toBe('Radar');
    expect(post.slides[0]?.htmlContent).toBe('<html><body>slide</body></html>');
    expect(post.slides[0]?.imageUrl).toBeNull();
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

  test('does not create any comment automation automatically — those are configured manually post-publish', async () => {
    await prisma.contentBrief.update({ where: { themeId }, data: { postGoal: 'comment_dm' } });
    vi.mocked(writeCarouselCopy).mockResolvedValue({
      ...validCopy,
      ctaKeyword: 'MAPA',
      slides: [...validCopy.slides, buildSlide({ role: 'cta', template: 'cta' })],
    });
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');

    const postId = await generatePostFromTheme(themeId);

    const automations = await prisma.commentAutomation.findMany({ where: { postId } });
    expect(automations).toHaveLength(0);
  });

  test('errors out when postGoal is comment_dm but the copy has no ctaKeyword', async () => {
    await prisma.contentBrief.update({ where: { themeId }, data: { postGoal: 'comment_dm' } });
    vi.mocked(writeCarouselCopy).mockResolvedValue({
      ...validCopy,
      ctaKeyword: null,
      slides: [...validCopy.slides, buildSlide({ role: 'cta', template: 'cta' })],
    });
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');

    await expect(generatePostFromTheme(themeId)).rejects.toThrow('has no ctaKeyword');

    const posts = await prisma.post.findMany({ where: { themeId } });
    expect(posts[0]?.status).toBe('error');
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
