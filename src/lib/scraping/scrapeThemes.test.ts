import { describe, expect, test } from 'vitest';
import { normalizeUrl, parseSource, scrapeThemes, type SourceConfig } from './scrapeThemes';

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <body>
    <article class="story">
      <a class="story-link" href="/ai/new-model"><h2>New AI model ships</h2></a>
      <p class="dek">The release lowers inference costs for small teams.</p>
      <img class="hero" src="/images/model.jpg" />
      <img class="secondary" data-src="https://cdn.example.com/chart.png" />
      <img class="ignored" src="/images/third.jpg" />
    </article>
    <article class="story">
      <a class="story-link" href="https://news.example.com/security/passkeys"><h2>Passkeys reach more users</h2></a>
      <p class="dek">A platform update expands passwordless sign-in.</p>
    </article>
    <article class="story">
      <a class="story-link" href=""><h2>Broken item</h2></a>
    </article>
  </body>
</html>`;

const SOURCE: SourceConfig = {
  url: 'https://news.example.com/latest',
  articleSelector: 'article.story',
  linkSelector: 'a.story-link',
  headlineSelector: 'h2',
  summarySelector: 'p.dek',
  imageSelector: 'img',
};

describe('parseSource', () => {
  test('extracts normalized candidates and at most two images each', () => {
    // Arrange / Act
    const candidates = parseSource(FIXTURE_HTML, SOURCE);

    // Assert
    expect(candidates).toEqual([
      {
        sourceUrl: 'https://news.example.com/ai/new-model',
        headline: 'New AI model ships',
        summary: 'The release lowers inference costs for small teams.',
        referenceImageUrls: [
          'https://news.example.com/images/model.jpg',
          'https://cdn.example.com/chart.png',
        ],
      },
      {
        sourceUrl: 'https://news.example.com/security/passkeys',
        headline: 'Passkeys reach more users',
        summary: 'A platform update expands passwordless sign-in.',
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
    const fetchHtml = async (_url: string): Promise<string> => FIXTURE_HTML;

    // Act
    const candidates = await scrapeThemes(fetchHtml, [SOURCE, SOURCE]);

    // Assert
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.sourceUrl).toBe('https://news.example.com/ai/new-model');
  });
});
