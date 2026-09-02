import * as cheerio from 'cheerio';

export interface SourceConfig {
  url: string;
  articleSelector: string;
  linkSelector: string;
  headlineSelector: string;
  summarySelector: string;
  imageSelector: string;
}

export interface ScrapedCandidate {
  sourceUrl: string;
  headline: string;
  summary: string;
  referenceImageUrls: string[];
}

const MAX_REFERENCE_IMAGES = 2;

export const SOURCES: readonly SourceConfig[] = [
  {
    url: 'https://techcrunch.com/latest/',
    articleSelector: 'article',
    linkSelector: 'a',
    headlineSelector: 'h2, h3',
    summarySelector: 'p',
    imageSelector: 'img',
  },
  {
    url: 'https://www.theverge.com/tech',
    articleSelector: 'article',
    linkSelector: 'a',
    headlineSelector: 'h2, h3',
    summarySelector: 'p',
    imageSelector: 'img',
  },
  {
    url: 'https://arstechnica.com/gadgets/',
    articleSelector: 'article',
    linkSelector: 'a',
    headlineSelector: 'h2, h3',
    summarySelector: 'p',
    imageSelector: 'img',
  },
];

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

function firstText(article: cheerio.Cheerio<import('domhandler').Element>, selector: string): string {
  return article.find(selector).first().text().trim().replace(/\s+/g, ' ');
}

function imageUrls(
  $: cheerio.CheerioAPI,
  article: cheerio.Cheerio<import('domhandler').Element>,
  sourceUrl: string,
  selector: string,
): string[] {
  const normalized = article
    .find(selector)
    .toArray()
    .map((element) => $(element).attr('src') ?? $(element).attr('data-src') ?? '')
    .map((raw) => normalizeUrl(sourceUrl, raw))
    .filter((url) => url.length > 0);

  return Array.from(new Set(normalized)).slice(0, MAX_REFERENCE_IMAGES);
}

export function parseSource(html: string, source: SourceConfig): ScrapedCandidate[] {
  const $ = cheerio.load(html);

  return $(source.articleSelector)
    .toArray()
    .map((element) => {
      const article = $(element) as cheerio.Cheerio<import('domhandler').Element>;
      const href = article.find(source.linkSelector).first().attr('href') ?? '';
      return {
        sourceUrl: normalizeUrl(source.url, href),
        headline: firstText(article, source.headlineSelector),
        summary: firstText(article, source.summarySelector),
        referenceImageUrls: imageUrls($, article, source.url, source.imageSelector),
      };
    })
    .filter((candidate) => candidate.sourceUrl.length > 0 && candidate.headline.length > 0);
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
