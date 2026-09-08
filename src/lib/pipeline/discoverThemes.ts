import { acquireStage, finishStage, safeError } from './state';
import { scoreTheme } from '@/lib/ai/scoreTheme';
import { prisma } from '@/lib/prisma';
import { enrichArticle } from '@/lib/scraping/enrichArticle';
import { scrapeThemes, type ScrapedCandidate } from '@/lib/scraping/scrapeThemes';

// Requests a generous duration for this function: scraping (up to 10s
// per source) + enrichment (up to 10s per candidate, parallel) + AI
// scoring (up to 45s per candidate, parallel) can add up to more than
// the platform's old 60s default even with everything else fast.


// Enrichment opens a real HTTP request per candidate, so only a bounded
// slice of the listing gets that treatment. Kept small — each one also
// pays for a full scoreTheme AI call, and the whole run has one shared
// time budget (see maxDuration above).
const MAX_CANDIDATES_TO_ENRICH = 3;
// How many scored themes get persisted as pending suggestions per run.
const MAX_THEMES_TO_DISCOVER = 3;

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
  let failed = 0;
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
        failed++;
        // A single article failing to fetch/parse should not fail the run —
        // it just doesn't get scored this time. The next discover run tries again.
        return null;
      }
    }),
  );
  if (selected.length && failed === selected.length) throw new Error('All selected articles failed to load');
  return results.filter((item): item is EnrichedCandidate => item !== null);
}

export async function discoverThemes(): Promise<{ discovered: number; failed: number; busy?: boolean }> {
  const owner = await acquireStage('discover');
  if (!owner) return { discovered: 0, failed: 0, busy: true };
  const counts = { discovered: 0, failed: 0 };
  try {
    const { brandStrategy, leadMagnets } = await loadBrandContext();
    const scraped = await scrapeThemes();
    const known = await prisma.theme.findMany({ where: { sourceUrl: { in: scraped.map(c => c.sourceUrl) } }, select: { sourceUrl: true } });
    const knownUrls = new Set(known.map(t => t.sourceUrl));
    const candidates = scraped.filter(c => !knownUrls.has(c.sourceUrl));
    const enriched = await enrichSelectedCandidates(candidates);

    const leadMagnetOptions = leadMagnets.map((magnet) => ({
      ctaKeyword: magnet.ctaKeyword,
      name: magnet.name,
      description: magnet.description,
    }));

    const assessments = await Promise.allSettled(
      enriched.map(async (item) => {
        const input = {
          sourceUrl: item.candidate.sourceUrl,
          headline: item.candidate.headline,
          articleBody: item.articleBody,
          articleFacts: item.articleFacts,
        };
        try {
          return { item, score: await scoreTheme(input, brandStrategy, leadMagnetOptions) };
        } catch {
          // Providers occasionally return a transient error or malformed JSON.
          // One bounded retry keeps a single bad response from wasting an
          // otherwise healthy discovery run.
          return { item, score: await scoreTheme(input, brandStrategy, leadMagnetOptions) };
        }
      }),
    );

    counts.failed = assessments.filter(r => r.status === 'rejected').length;
    const scored = assessments.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
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

    counts.discovered = topThemes.length;
    const hardFailure = counts.failed > 0 && counts.discovered === 0;
    await finishStage('discover', owner, counts, hardFailure ? 'No article could be scored' : undefined);
    return counts;
  } catch (error) {
    await finishStage('discover', owner, { ...counts, failed: counts.failed + 1 }, safeError(error));
    throw error;
  }
}
