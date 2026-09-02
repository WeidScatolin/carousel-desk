import { describe, expect, test } from 'vitest';
import { normalizeUrl, parseSource, scrapeThemes, SOURCES, type SourceConfig } from './scrapeThemes';

const TECHCRUNCH_HTML = `<!doctype html>
<html>
  <body>
    <div class="loop-card">
      <h3 class="loop-card__title">
        <a class="loop-card__title-link" href="https://techcrunch.com/2026/09/02/first-story/">First story ships</a>
      </h3>
    </div>
    <div class="loop-card">
      <h3 class="loop-card__title">
        <a class="loop-card__title-link" href="https://techcrunch.com/2026/09/02/second-story/">Second story ships</a>
      </h3>
    </div>
    <div class="loop-card">
      <h3 class="loop-card__title">
        <a class="loop-card__title-link" href="">Broken link is skipped</a>
      </h3>
    </div>
  </body>
</html>`;

const THE_VERGE_HTML = `<!doctype html>
<html>
  <body>
    <div class="content-card" role="article">
      <a aria-label="Samsung ships a new laptop" href="/tech/1/samsung-ships-a-new-laptop"></a>
    </div>
    <div class="content-card" role="article">
      <a aria-label="A platform update rolls out" href="/tech/2/a-platform-update-rolls-out"></a>
    </div>
    <div class="content-card" role="article">
      <a href="/tech/3/no-aria-label-is-skipped"></a>
    </div>
  </body>
</html>`;

const TECHCRUNCH_SOURCE: SourceConfig = SOURCES[0]!;
const THE_VERGE_SOURCE: SourceConfig = SOURCES[1]!;

describe('parseSource', () => {
  test('extracts headline and absolute URL from TechCrunch-style listing cards', () => {
    // Arrange / Act
    const candidates = parseSource(TECHCRUNCH_HTML, TECHCRUNCH_SOURCE);

    // Assert
    expect(candidates).toEqual([
      {
        sourceUrl: 'https://techcrunch.com/2026/09/02/first-story/',
        headline: 'First story ships',
        summary: '',
        referenceImageUrls: [],
      },
      {
        sourceUrl: 'https://techcrunch.com/2026/09/02/second-story/',
        headline: 'Second story ships',
        summary: '',
        referenceImageUrls: [],
      },
    ]);
  });

  test('extracts headline from aria-label and resolves relative URLs for The Verge-style cards', () => {
    // Arrange / Act
    const candidates = parseSource(THE_VERGE_HTML, THE_VERGE_SOURCE);

    // Assert
    expect(candidates).toEqual([
      {
        sourceUrl: 'https://www.theverge.com/tech/1/samsung-ships-a-new-laptop',
        headline: 'Samsung ships a new laptop',
        summary: '',
        referenceImageUrls: [],
      },
      {
        sourceUrl: 'https://www.theverge.com/tech/2/a-platform-update-rolls-out',
        headline: 'A platform update rolls out',
        summary: '',
        referenceImageUrls: [],
      },
    ]);
  });
});

describe('normalizeUrl', () => {
  test('rejects non-http protocols', () => {
    // Arrange / Act / Assert
    expect(normalizeUrl('https://news.example.com', 'javascript:alert(1)')).toBe('');
    expect(normalizeUrl('https://news.example.com', 'data:image/png;base64,abc')).toBe('');
  });

  test('rejects an empty value instead of resolving to the base URL', () => {
    // Arrange / Act / Assert
    expect(normalizeUrl('https://news.example.com/latest', '')).toBe('');
  });
});

describe('scrapeThemes', () => {
  test('deduplicates candidates across sources by sourceUrl', async () => {
    // Arrange
    const fetchHtml = async (url: string): Promise<string> =>
      url === TECHCRUNCH_SOURCE.url ? TECHCRUNCH_HTML : THE_VERGE_HTML;

    // Act
    const candidates = await scrapeThemes(fetchHtml, [TECHCRUNCH_SOURCE, TECHCRUNCH_SOURCE]);

    // Assert
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.sourceUrl).toBe('https://techcrunch.com/2026/09/02/first-story/');
  });

  test('combines candidates from multiple distinct sources', async () => {
    // Arrange
    const fetchHtml = async (url: string): Promise<string> =>
      url === TECHCRUNCH_SOURCE.url ? TECHCRUNCH_HTML : THE_VERGE_HTML;

    // Act
    const candidates = await scrapeThemes(fetchHtml, [TECHCRUNCH_SOURCE, THE_VERGE_SOURCE]);

    // Assert
    expect(candidates).toHaveLength(4);
  });
});
