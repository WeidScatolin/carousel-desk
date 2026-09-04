import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/scraping/scrapeThemes', () => ({ scrapeThemes: vi.fn() }));
vi.mock('@/lib/scraping/enrichArticle', () => ({ enrichArticle: vi.fn() }));
vi.mock('@/lib/ai/scoreTheme', () => ({ scoreTheme: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandStrategy: { findFirst: vi.fn() },
    leadMagnet: { findMany: vi.fn() },
    theme: { upsert: vi.fn() },
    contentBrief: { upsert: vi.fn() },
  },
}));

import { scoreTheme } from '@/lib/ai/scoreTheme';
import { prisma } from '@/lib/prisma';
import { enrichArticle } from '@/lib/scraping/enrichArticle';
import { scrapeThemes } from '@/lib/scraping/scrapeThemes';
import { POST } from './route';

function request(token = 'test-token'): Request {
  return new Request('http://localhost/api/pipeline/discover', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

const candidate = {
  sourceUrl: 'https://example.com/news',
  headline: 'Raw headline',
  summary: '',
  referenceImageUrls: ['https://example.com/photo.jpg'],
};

const enrichment = {
  articleBody: 'First real paragraph of the article.\n\nSecond paragraph.',
  articleFacts: ['First real paragraph of the article.'],
  articleAuthor: 'Jane Doe',
  articlePublishedAt: new Date('2026-09-02T00:00:00.000Z'),
  hasSufficientEvidence: true,
};

const score = {
  audienceFitScore: 80,
  businessImpactScore: 70,
  hookPotentialScore: 60,
  evidenceQualityScore: 90,
  offerBridgeScore: 50,
  noveltyScore: 40,
  totalScore: 69,
  contentPillar: 'radar' as const,
  funnelStage: 'awareness' as const,
  postGoal: 'follow' as const,
  targetPain: 'Não sabe por onde começar',
  businessApplication: 'Aplicar o mecanismo no atendimento',
  angle: 'O que isso significa para PMEs',
  strategicRationale: 'Tema relevante para o público comprador',
  recommendedLeadMagnetKeyword: 'MAPA',
  hook: 'Gancho um',
  hookVariants: ['Gancho um', 'Gancho dois', 'Gancho três'],
};

const brandStrategy = {
  id: 'brand-1',
  positioning: 'pos',
  targetAudience: 'aud',
  coreProblem: 'problem',
  promise: 'promise',
  offerDescription: 'offer',
  tone: 'tone',
};

describe('POST /api/pipeline/discover', () => {
  beforeEach(() => {
    vi.stubEnv('DISCOVERY_API_TOKEN', 'test-token');
    vi.mocked(scrapeThemes).mockReset();
    vi.mocked(enrichArticle).mockReset();
    vi.mocked(scoreTheme).mockReset();
    vi.mocked(prisma.brandStrategy.findFirst).mockReset();
    vi.mocked(prisma.leadMagnet.findMany).mockReset();
    vi.mocked(prisma.theme.upsert).mockReset();
    vi.mocked(prisma.contentBrief.upsert).mockReset();
  });

  test('returns 401 without the configured bearer token', async () => {
    // Arrange / Act
    const response = await POST(request('wrong-token'));

    // Assert
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(scrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 401 when the authorization header is absent', async () => {
    // Arrange
    const unauthorized = new Request('http://localhost/api/pipeline/discover', { method: 'POST' });

    // Act
    const response = await POST(unauthorized);

    // Assert
    expect(response.status).toBe(401);
    expect(scrapeThemes).not.toHaveBeenCalled();
  });

  test('scrapes, enriches, scores and upserts a theme with its content brief', async () => {
    // Arrange
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(brandStrategy as never);
    vi.mocked(prisma.leadMagnet.findMany).mockResolvedValue([
      { id: 'magnet-1', ctaKeyword: 'MAPA', name: 'Mapa', description: 'desc' },
    ] as never);
    vi.mocked(scrapeThemes).mockResolvedValue([candidate]);
    vi.mocked(enrichArticle).mockResolvedValue(enrichment);
    vi.mocked(scoreTheme).mockResolvedValue(score);
    vi.mocked(prisma.theme.upsert).mockResolvedValue({ id: 'theme-1' } as never);
    vi.mocked(prisma.contentBrief.upsert).mockResolvedValue({ id: 'brief-1' } as never);

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { discovered: 1 } });
    expect(prisma.theme.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceUrl: 'https://example.com/news' },
        create: expect.objectContaining({
          sourceUrl: 'https://example.com/news',
          headlineSuggestion: 'Raw headline',
          summary: 'First real paragraph of the article.',
          hasSufficientEvidence: true,
          articleAuthor: 'Jane Doe',
        }),
      }),
    );
    expect(prisma.contentBrief.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { themeId: 'theme-1' },
        create: expect.objectContaining({
          themeId: 'theme-1',
          contentPillar: 'radar',
          totalScore: 69,
          leadMagnetId: 'magnet-1',
          hookVariants: ['Gancho um', 'Gancho dois', 'Gancho três'],
        }),
      }),
    );
  });

  test('skips candidates whose article does not have sufficient evidence', async () => {
    // Arrange
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(brandStrategy as never);
    vi.mocked(prisma.leadMagnet.findMany).mockResolvedValue([]);
    vi.mocked(scrapeThemes).mockResolvedValue([candidate]);
    vi.mocked(enrichArticle).mockResolvedValue({ ...enrichment, hasSufficientEvidence: false });

    // Act
    const response = await POST(request());

    // Assert
    expect(await response.json()).toEqual({ success: true, data: { discovered: 0 } });
    expect(scoreTheme).not.toHaveBeenCalled();
    expect(prisma.theme.upsert).not.toHaveBeenCalled();
  });

  test('skips a candidate whose article fetch fails without failing the whole run', async () => {
    // Arrange
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(brandStrategy as never);
    vi.mocked(prisma.leadMagnet.findMany).mockResolvedValue([]);
    vi.mocked(scrapeThemes).mockResolvedValue([candidate]);
    vi.mocked(enrichArticle).mockRejectedValue(new Error('network error'));

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { discovered: 0 } });
  });

  test('keeps only the top-scoring themes when more candidates than the cap are enriched', async () => {
    // Arrange
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      ...candidate,
      sourceUrl: `https://example.com/news-${index}`,
    }));
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(brandStrategy as never);
    vi.mocked(prisma.leadMagnet.findMany).mockResolvedValue([]);
    vi.mocked(scrapeThemes).mockResolvedValue(candidates);
    vi.mocked(enrichArticle).mockResolvedValue(enrichment);
    vi.mocked(scoreTheme).mockImplementation(async (input) => ({
      ...score,
      totalScore: input.sourceUrl.endsWith('7') ? 99 : 10,
    }));
    vi.mocked(prisma.theme.upsert).mockResolvedValue({ id: 'theme-x' } as never);
    vi.mocked(prisma.contentBrief.upsert).mockResolvedValue({ id: 'brief-x' } as never);

    // Act
    const response = await POST(request());

    // Assert — capped at 5 persisted themes even though 8 were enriched
    expect(await response.json()).toEqual({ success: true, data: { discovered: 5 } });
    expect(prisma.theme.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.theme.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceUrl: 'https://example.com/news-7' } }),
    );
  });

  test('returns 500 when there is no active BrandStrategy configured', async () => {
    // Arrange
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(null);

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(500);
    expect(scrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 500 when scraping fails', async () => {
    // Arrange
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(brandStrategy as never);
    vi.mocked(prisma.leadMagnet.findMany).mockResolvedValue([]);
    vi.mocked(scrapeThemes).mockRejectedValue(new Error('scraper unavailable'));

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: 'Theme discovery failed' });
  });
});
