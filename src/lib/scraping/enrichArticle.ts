import * as cheerio from 'cheerio';
import { fetchHtml as defaultFetchHtml } from './fetchHtml';

export interface EnrichedArticle {
  articleBody: string;
  articleFacts: string[];
  articleAuthor: string | null;
  articlePublishedAt: Date | null;
  hasSufficientEvidence: boolean;
}

// A body shorter than this is treated as too thin to ground a factual
// carousel — the caller should not let the AI write claims from a
// headline alone. 500 chars is roughly 2-3 real paragraphs.
const MIN_BODY_LENGTH_FOR_EVIDENCE = 500;

// Token/size guard before the extracted text is handed to a prompt.
const MAX_BODY_LENGTH_FOR_MODEL = 6000;

const MAX_FACTS = 10;

interface RawExtraction {
  paragraphs: string[];
  author: string | null;
  publishedAt: Date | null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// TechCrunch article pages — verified against a live article
// (techcrunch.com/2026/08/24/hugging-face-...): body paragraphs are
// <p class="wp-block-paragraph"> inside <div class="entry-content">,
// interleaved with <div class="ad-unit"> blocks that carry no <p> of
// their own so they're excluded by the selector alone. Author name sits
// at .article-hero__authors .wp-block-tc23-author-card-name__link.
// Publish date comes from the article:published_time meta tag.
function extractTechCrunch($: cheerio.CheerioAPI): RawExtraction {
  const paragraphs = $('.entry-content p.wp-block-paragraph')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const author = $('.article-hero__authors .wp-block-tc23-author-card-name__link').first().text().trim() || null;
  const publishedAt = parseDate($('meta[property="article:published_time"]').attr('content'));
  return { paragraphs, author, publishedAt };
}

// The Verge article pages — verified against a live article
// (theverge.com/ai-artificial-intelligence/988742/google-gemini-3-8-flash):
// each body paragraph is wrapped in its own
// <div class="duet--article--article-body-component">; the <p> inside it
// carries CSS-module hash classes that churn on redeploy, so the selector
// targets the stable wrapper div and reads its text instead. Author and
// publish date come from <meta name="author"> and article:published_time.
function extractTheVerge($: cheerio.CheerioAPI): RawExtraction {
  const paragraphs = $('.duet--article--article-body-component')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const author = $('meta[name="author"]').attr('content')?.trim() || null;
  const publishedAt = parseDate($('meta[property="article:published_time"]').attr('content'));
  return { paragraphs, author, publishedAt };
}

function extractByHost(html: string, sourceUrl: string): RawExtraction {
  const $ = cheerio.load(html);
  const hostname = new URL(sourceUrl).hostname;
  if (hostname.endsWith('techcrunch.com')) {
    return extractTechCrunch($);
  }
  if (hostname.endsWith('theverge.com')) {
    return extractTheVerge($);
  }
  throw new Error(`enrichArticle: no article extractor configured for host "${hostname}"`);
}

// Sentences that carry a digit (percentage, dollar amount, count, date)
// are treated as candidate "facts" worth surfacing to the copy prompt —
// this is pure extraction from the real paragraphs, never a guess.
function extractFacts(paragraphs: string[]): string[] {
  const facts: string[] = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed && /\d/.test(trimmed)) {
        facts.push(trimmed);
      }
      if (facts.length >= MAX_FACTS) {
        return facts;
      }
    }
  }
  return facts;
}

export async function enrichArticle(
  sourceUrl: string,
  fetchHtml: (url: string) => Promise<string> = defaultFetchHtml,
): Promise<EnrichedArticle> {
  const html = await fetchHtml(sourceUrl);
  const { paragraphs, author, publishedAt } = extractByHost(html, sourceUrl);

  const fullBody = paragraphs.join('\n\n');
  const articleBody =
    fullBody.length > MAX_BODY_LENGTH_FOR_MODEL ? fullBody.slice(0, MAX_BODY_LENGTH_FOR_MODEL) : fullBody;

  return {
    articleBody,
    articleFacts: extractFacts(paragraphs),
    articleAuthor: author,
    articlePublishedAt: publishedAt,
    hasSufficientEvidence: fullBody.length >= MIN_BODY_LENGTH_FOR_EVIDENCE,
  };
}
