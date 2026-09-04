import { timingSafeEqual } from 'node:crypto';
import { scoreTheme } from '@/lib/ai/scoreTheme';
import { prisma } from '@/lib/prisma';
import { enrichArticle } from '@/lib/scraping/enrichArticle';
import { scrapeThemes, type ScrapedCandidate } from '@/lib/scraping/scrapeThemes';

// Enrichment opens a real HTTP request per candidate, so only a bounded
// slice of the listing gets that treatment.
const MAX_CANDIDATES_TO_ENRICH = 8;
// How many scored themes get persisted as pending suggestions per run.
const MAX_THEMES_TO_DISCOVER = 5;

function authorized(request: Request): boolean {
  const expected = process.env.DISCOVERY_API_TOKEN;
  const provided = request.headers.get('authorization');
  if (!expected || !provided?.startsWith('Bearer ')) {
    return false;
  }
  const actual = provided.slice('Bearer '.length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}

async function loadBrandContext() {
  const brandStrategy = await prisma.brandStrategy.findFirst({ where: { active: true } });
  if (!brandStrategy) {
    throw new Error('discover: no active BrandStrategy configured');
  }
  const leadMagnets = await prisma.leadMagnet.findMany({ where: { active: true } });
  return { brandStrategy, leadMagnets };
}

interface EnrichedCandidate {
  candidate: ScrapedCandidate;
  articleBody: string;
  articleFacts: string[];
  articleAuthor: string | null;
  articlePublishedAt: Date | null;
}

async function enrichSelectedCandidates(candidates: ScrapedCandidate[]): Promise<EnrichedCandidate[]> {
  const selected = candidates.slice(0, MAX_CANDIDATES_TO_ENRICH);
  const results = await Promise.all(
    selected.map(async (candidate): Promise<EnrichedCandidate | null> => {
      try {
        const enrichment = await enrichArticle(candidate.sourceUrl);
        if (!enrichment.hasSufficientEvidence) {
          return null;
        }
        return {
          candidate,
          articleBody: enrichment.articleBody,
          articleFacts: enrichment.articleFacts,
          articleAuthor: enrichment.articleAuthor,
          articlePublishedAt: enrichment.articlePublishedAt,
        };
      } catch {
        // A single article failing to fetch/parse should not fail the run —
        // it just doesn't get scored this time. The next discover run tries again.
        return null;
      }
    }),
  );
  return results.filter((item): item is EnrichedCandidate => item !== null);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { brandStrategy, leadMagnets } = await loadBrandContext();
    const candidates = await scrapeThemes();
    const enriched = await enrichSelectedCandidates(candidates);

    const leadMagnetOptions = leadMagnets.map((magnet) => ({
      ctaKeyword: magnet.ctaKeyword,
      name: magnet.name,
      description: magnet.description,
    }));

    const scored = await Promise.all(
      enriched.map(async (item) => ({
        item,
        score: await scoreTheme(
          {
            sourceUrl: item.candidate.sourceUrl,
            headline: item.candidate.headline,
            articleBody: item.articleBody,
            articleFacts: item.articleFacts,
          },
          brandStrategy,
          leadMagnetOptions,
        ),
      })),
    );

    const topThemes = scored
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .slice(0, MAX_THEMES_TO_DISCOVER);

    for (const { item, score } of topThemes) {
      const summary = item.articleBody.split('\n\n')[0]?.slice(0, 500) ?? item.candidate.headline;

      const theme = await prisma.theme.upsert({
        where: { sourceUrl: item.candidate.sourceUrl },
        create: {
          sourceUrl: item.candidate.sourceUrl,
          headlineSuggestion: item.candidate.headline,
          summary,
          referenceImageUrls: item.candidate.referenceImageUrls,
          status: 'pending',
          articleBody: item.articleBody,
          articleFacts: item.articleFacts,
          articleAuthor: item.articleAuthor,
          articlePublishedAt: item.articlePublishedAt,
          hasSufficientEvidence: true,
        },
        update: {
          headlineSuggestion: item.candidate.headline,
          summary,
          referenceImageUrls: item.candidate.referenceImageUrls,
          articleBody: item.articleBody,
          articleFacts: item.articleFacts,
          articleAuthor: item.articleAuthor,
          articlePublishedAt: item.articlePublishedAt,
          hasSufficientEvidence: true,
        },
      });

      const leadMagnet = leadMagnets.find((magnet) => magnet.ctaKeyword === score.recommendedLeadMagnetKeyword);

      const briefData = {
        contentPillar: score.contentPillar,
        funnelStage: score.funnelStage,
        postGoal: score.postGoal,
        targetPain: score.targetPain,
        businessApplication: score.businessApplication,
        hook: score.hook,
        hookVariants: score.hookVariants,
        angle: score.angle,
        strategicRationale: score.strategicRationale,
        leadMagnetId: leadMagnet?.id ?? null,
        audienceFitScore: score.audienceFitScore,
        businessImpactScore: score.businessImpactScore,
        hookPotentialScore: score.hookPotentialScore,
        evidenceQualityScore: score.evidenceQualityScore,
        offerBridgeScore: score.offerBridgeScore,
        noveltyScore: score.noveltyScore,
        totalScore: score.totalScore,
      };

      await prisma.contentBrief.upsert({
        where: { themeId: theme.id },
        create: { themeId: theme.id, ...briefData },
        update: briefData,
      });
    }

    return Response.json({ success: true, data: { discovered: topThemes.length } });
  } catch {
    return Response.json(
      { success: false, error: 'Theme discovery failed' },
      { status: 500 },
    );
  }
}
