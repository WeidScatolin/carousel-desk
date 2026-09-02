import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));
vi.mock('./designSystem', () => ({ loadDesignSystem: () => 'EDITORIAL SYSTEM' }));

import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';
import { suggestThemes } from './suggestThemes';

const candidates = Array.from({ length: 5 }, (_, index) => ({
  sourceUrl: `https://example.com/${index}`,
  headline: `Headline ${index}`,
  summary: `Summary ${index}`,
  referenceImageUrls: [],
}));

describe('suggestThemes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('uses NVIDIA and returns three to five validated suggestions', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(candidates.slice(0, 3).map(
      (candidate) => ({
        sourceUrl: candidate.sourceUrl,
        headlineSuggestion: `Editorial ${candidate.headline}`,
        summary: candidate.summary,
      }),
    )));

    // Act
    const result = await suggestThemes(candidates);

    // Assert
    expect(result).toHaveLength(3);
    expect(result[0]?.headlineSuggestion).toBe('Editorial Headline 0');
    expect(completeWithNvidia).toHaveBeenCalledWith(expect.stringContaining('EDITORIAL SYSTEM'));
    expect(completeWithClaude).not.toHaveBeenCalled();
  });

  test('uses Claude when configured', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(candidates.slice(0, 3).map(
      (candidate) => ({
        sourceUrl: candidate.sourceUrl,
        headlineSuggestion: candidate.headline,
        summary: candidate.summary,
      }),
    )));

    // Act
    await suggestThemes(candidates);

    // Assert
    expect(completeWithClaude).toHaveBeenCalledTimes(1);
    expect(completeWithNvidia).not.toHaveBeenCalled();
  });

  test('rejects invalid JSON from the provider', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue('not-json');

    // Act / Assert
    await expect(suggestThemes(candidates)).rejects.toThrow(
      'suggestThemes: provider response was not valid JSON',
    );
  });

  test('rejects suggestions whose URL was not scraped', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(Array.from(
      { length: 3 },
      (_, index) => ({
        sourceUrl: `https://invented.example/${index}`,
        headlineSuggestion: `Invented ${index}`,
        summary: 'Invented',
      }),
    )));

    // Act / Assert
    await expect(suggestThemes(candidates)).rejects.toThrow(
      'suggestThemes: suggestion sourceUrl was not present in candidates',
    );
  });

  test('rejects duplicate source URLs in provider suggestions', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(Array.from(
      { length: 3 },
      (_, index) => ({
        sourceUrl: candidates[0]?.sourceUrl,
        headlineSuggestion: `Version ${index}`,
        summary: 'Repeated source',
      }),
    )));

    // Act / Assert
    await expect(suggestThemes(candidates)).rejects.toThrow(
      'suggestThemes: sourceUrl values must be unique',
    );
  });
});
