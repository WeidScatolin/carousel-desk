import { describe, expect, test } from 'vitest';
import { enrichArticle } from './enrichArticle';

const TECHCRUNCH_ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="article:published_time" content="2026-08-24T13:47:26+00:00" />
  </head>
  <body>
    <div class="article-hero__authors">
      <div class="wp-block-tc23-author-card-name">
        <a class="wp-block-tc23-author-card-name__link" href="https://techcrunch.com/author/rebecca-bellan/">Rebecca Bellan</a>
      </div>
    </div>
    <div class="entry-content wp-block-post-content">
      <p id="speakable-summary" class="wp-block-paragraph">The startup was approached at a valuation of $13 billion.</p>
      <div class="ad-unit ad-unit--mobile">
        <div class="ad-unit__ad" id="us-tc-ros-mw-mid-center"></div>
      </div>
      <p class="wp-block-paragraph">It's not clear who the startup has been in talks with, and no deal has yet been reached.</p>
      <p class="wp-block-paragraph">The startup last raised in 2023 at a $4.5 billion post-money valuation.</p>
    </div>
  </body>
</html>`;

const THE_VERGE_ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="article:published_time" content="2026-09-02T20:11:40+00:00"/>
    <meta name="author" content="Stevie Bonifield"/>
  </head>
  <body>
    <div class="duet--article--article-body-component">
      <p class="duet--article--standard-paragraph _abc123">Google launched Gemini 3.8 Flash, with pricing of $0.75 per million input tokens.</p>
    </div>
    <div class="duet--article--article-body-component">
      <p class="duet--article--standard-paragraph _abc123">The launch was followed by early benchmarks from independent researchers.</p>
    </div>
  </body>
</html>`;

describe('enrichArticle', () => {
  test('extracts body, author and publish date from a TechCrunch article page', async () => {
    // Arrange
    const fetchHtml = async (): Promise<string> => TECHCRUNCH_ARTICLE_HTML;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/some-story/', fetchHtml);

    // Assert
    expect(result.articleBody).toContain('approached at a valuation of $13 billion');
    expect(result.articleBody).toContain('last raised in 2023');
    expect(result.articleAuthor).toBe('Rebecca Bellan');
    expect(result.articlePublishedAt?.toISOString()).toBe('2026-08-24T13:47:26.000Z');
  });

  test('excludes ad-unit blocks from the extracted TechCrunch body', async () => {
    // Arrange
    const fetchHtml = async (): Promise<string> => TECHCRUNCH_ARTICLE_HTML;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/some-story/', fetchHtml);

    // Assert
    expect(result.articleBody).not.toContain('ad-unit');
    expect(result.articleBody).not.toContain('us-tc-ros-mw-mid-center');
  });

  test('extracts body, author and publish date from a The Verge article page', async () => {
    // Arrange
    const fetchHtml = async (): Promise<string> => THE_VERGE_ARTICLE_HTML;

    // Act
    const result = await enrichArticle('https://www.theverge.com/ai/1/gemini-flash', fetchHtml);

    // Assert
    expect(result.articleBody).toContain('Gemini 3.8 Flash');
    expect(result.articleBody).toContain('independent researchers');
    expect(result.articleAuthor).toBe('Stevie Bonifield');
    expect(result.articlePublishedAt?.toISOString()).toBe('2026-09-02T20:11:40.000Z');
  });

  test('throws for a host with no configured extractor instead of guessing at markup', async () => {
    // Arrange
    const fetchHtml = async (): Promise<string> => '<html><body>irrelevant</body></html>';

    // Act / Assert
    await expect(enrichArticle('https://example.com/some-article', fetchHtml)).rejects.toThrow(
      /no article extractor configured/,
    );
  });

  test('marks evidence as sufficient when the extracted body clears the minimum length', async () => {
    // Arrange
    const fetchHtml = async (): Promise<string> => TECHCRUNCH_ARTICLE_HTML;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/some-story/', fetchHtml);

    // Assert — the fixture body is short, well under the 500-char threshold
    expect(result.hasSufficientEvidence).toBe(false);
  });

  test('marks evidence as sufficient once the body reaches the minimum length', async () => {
    // Arrange
    const longParagraph = 'A'.repeat(600);
    const html = `<!doctype html>
<html>
  <body>
    <div class="entry-content wp-block-post-content">
      <p class="wp-block-paragraph">${longParagraph}</p>
    </div>
  </body>
</html>`;
    const fetchHtml = async (): Promise<string> => html;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/long-story/', fetchHtml);

    // Assert
    expect(result.hasSufficientEvidence).toBe(true);
  });

  test('truncates the body before the model size limit and never invents missing content', async () => {
    // Arrange
    const hugeParagraph = 'word '.repeat(2000); // ~10000 chars, over the 6000-char cap
    const html = `<!doctype html>
<html>
  <body>
    <div class="entry-content wp-block-post-content">
      <p class="wp-block-paragraph">${hugeParagraph}</p>
    </div>
  </body>
</html>`;
    const fetchHtml = async (): Promise<string> => html;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/huge-story/', fetchHtml);

    // Assert
    expect(result.articleBody.length).toBeLessThanOrEqual(6000);
  });

  test('extracts only sentences carrying a digit as facts, capped at 10', async () => {
    // Arrange
    const fetchHtml = async (): Promise<string> => TECHCRUNCH_ARTICLE_HTML;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/some-story/', fetchHtml);

    // Assert
    expect(result.articleFacts).toContain(
      'The startup was approached at a valuation of $13 billion.',
    );
    expect(result.articleFacts).toContain('The startup last raised in 2023 at a $4.5 billion post-money valuation.');
    expect(result.articleFacts).not.toContain(
      "It's not clear who the startup has been in talks with, and no deal has yet been reached.",
    );
    expect(result.articleFacts.length).toBeLessThanOrEqual(10);
  });

  test('returns null author and publish date when the source page has none', async () => {
    // Arrange
    const html = `<!doctype html>
<html>
  <body>
    <div class="entry-content wp-block-post-content">
      <p class="wp-block-paragraph">No byline or date on this page.</p>
    </div>
  </body>
</html>`;
    const fetchHtml = async (): Promise<string> => html;

    // Act
    const result = await enrichArticle('https://techcrunch.com/2026/08/24/anonymous-story/', fetchHtml);

    // Assert
    expect(result.articleAuthor).toBeNull();
    expect(result.articlePublishedAt).toBeNull();
  });
});
