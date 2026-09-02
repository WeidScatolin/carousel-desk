import * as cheerio from 'cheerio';

export interface ScrapedCandidate {
  sourceUrl: string;
  headline: string;
  summary: string;
  referenceImageUrls: string[];
}

export interface SourceConfig {
  url: string;
  extract: ($: cheerio.CheerioAPI, sourceUrl: string) => ScrapedCandidate[];
}

const MAX_REFERENCE_IMAGES = 2;

function dedupeBySourceUrl(candidates: ScrapedCandidate[]): ScrapedCandidate[] {
  const bySourceUrl = new Map<string, ScrapedCandidate>();
  for (const candidate of candidates) {
    bySourceUrl.set(candidate.sourceUrl, candidate);
  }
  return Array.from(bySourceUrl.values());
}

function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls)).slice(0, MAX_REFERENCE_IMAGES);
}

export function normalizeUrl(baseUrl: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const candidate = new URL(trimmed, baseUrl);
    return candidate.protocol === 'http:' || candidate.protocol === 'https:'
      ? candidate.toString()
      : '';
  } catch {
    return '';
  }
}

// TechCrunch's listing cards are each an <li class="wp-block-post"> containing
// one card thumbnail <img> and the headline at h3.loop-card__title >
// a.loop-card__title-link — verified against the live site (no separate
// excerpt/dek at this listing depth).
function extractTechCrunch($: cheerio.CheerioAPI, sourceUrl: string): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = [];
  $('li.wp-block-post').each((_, element) => {
    const item = $(element);
    const link = item.find('h3.loop-card__title a.loop-card__title-link').first();
    const href = normalizeUrl(sourceUrl, link.attr('href') ?? '');
    const headline = link.text().trim().replace(/\s+/g, ' ');
    if (!href || !headline) {
      return;
    }
    const imageUrl = normalizeUrl(sourceUrl, item.find('img').first().attr('src') ?? '');
    candidates.push({
      sourceUrl: href,
      headline,
      summary: '',
      referenceImageUrls: dedupeUrls(imageUrl ? [imageUrl] : []),
    });
  });
  return dedupeBySourceUrl(candidates);
}

// The Verge's listing cards use a div[role="article"] wrapper whose direct
// child <a> carries both the link (relative href) and the headline (as
// aria-label, not text content) — verified against the live site. Only
// "featured" cards carry a real article photo; "quick post" cards only have
// the author's avatar, so avatar URLs (author_profile_images path) are
// filtered out rather than used as the article's visual.
function extractTheVerge($: cheerio.CheerioAPI, sourceUrl: string): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = [];
  $('[role="article"]').each((_, element) => {
    const item = $(element);
    const link = item.find('a[aria-label]').first();
    const href = normalizeUrl(sourceUrl, link.attr('href') ?? '');
    const headline = (link.attr('aria-label') ?? '').trim();
    if (!href || !headline) {
      return;
    }
    const imageUrls = item
      .find('img')
      .toArray()
      .map((image) => $(image).attr('src') ?? '')
      .filter((src) => src && !src.includes('author_profile_images'))
      .map((src) => normalizeUrl(sourceUrl, src))
      .filter((url) => url.length > 0);
    candidates.push({
      sourceUrl: href,
      headline,
      summary: '',
      referenceImageUrls: dedupeUrls(imageUrls),
    });
  });
  return dedupeBySourceUrl(candidates);
}

// Ars Technica is deliberately excluded from the default sources: it returns
// an empty 202 response to a plain fetch (Cloudflare bot-protection challenge)
// and would require a headless browser to bypass, which the discover route
// intentionally avoids.
export const SOURCES: readonly SourceConfig[] = [
  { url: 'https://techcrunch.com/latest/', extract: extractTechCrunch },
  { url: 'https://www.theverge.com/tech', extract: extractTheVerge },
];

export function parseSource(html: string, source: SourceConfig): ScrapedCandidate[] {
  const $ = cheerio.load(html);
  return source.extract($, source.url);
}

async function defaultFetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`scrapeThemes: request to ${url} failed with status ${response.status}`);
  }
  return response.text();
}

export async function scrapeThemes(
  fetchHtml: (url: string) => Promise<string> = defaultFetchHtml,
  sources: readonly SourceConfig[] = SOURCES,
): Promise<ScrapedCandidate[]> {
  const bySourceUrl = new Map<string, ScrapedCandidate>();

  for (const source of sources) {
    const html = await fetchHtml(source.url);
    for (const candidate of parseSource(html, source)) {
      bySourceUrl.set(candidate.sourceUrl, candidate);
    }
  }

  return Array.from(bySourceUrl.values());
}
