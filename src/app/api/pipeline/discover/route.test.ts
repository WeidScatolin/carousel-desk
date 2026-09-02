import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/scraping/runScrapeThemes', () => ({ runScrapeThemes: vi.fn() }));
vi.mock('@/lib/ai/suggestThemes', () => ({ suggestThemes: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { theme: { upsert: vi.fn() } } }));

import { suggestThemes } from '@/lib/ai/suggestThemes';
import { prisma } from '@/lib/prisma';
import { runScrapeThemes } from '@/lib/scraping/runScrapeThemes';
import { POST } from './route';

function request(token = 'test-token'): Request {
  return new Request('http://localhost/api/pipeline/discover', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('POST /api/pipeline/discover', () => {
  beforeEach(() => {
    vi.stubEnv('DISCOVERY_API_TOKEN', 'test-token');
    vi.mocked(runScrapeThemes).mockReset();
    vi.mocked(suggestThemes).mockReset();
    vi.mocked(prisma.theme.upsert).mockReset();
  });

  test('returns 401 without the configured bearer token', async () => {
    // Arrange / Act
    const response = await POST(request('wrong-token'));

    // Assert
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(runScrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 401 when the authorization header is absent', async () => {
    // Arrange
    const unauthorized = new Request('http://localhost/api/pipeline/discover', {
      method: 'POST',
    });

    // Act
    const response = await POST(unauthorized);

    // Assert
    expect(response.status).toBe(401);
    expect(runScrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 401 when the server token is not configured', async () => {
    // Arrange
    vi.stubEnv('DISCOVERY_API_TOKEN', '');

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(401);
    expect(runScrapeThemes).not.toHaveBeenCalled();
  });

  test('scrapes, suggests and upserts pending themes without resetting status', async () => {
    // Arrange
    const candidates = [{
      sourceUrl: 'https://example.com/news',
      headline: 'Raw headline',
      summary: 'Raw summary',
      referenceImageUrls: [],
    }];
    const suggestions = [{
      sourceUrl: 'https://example.com/news',
      headlineSuggestion: 'Editorial headline',
      summary: 'Editorial summary',
    }];
    vi.mocked(runScrapeThemes).mockResolvedValue(candidates);
    vi.mocked(suggestThemes).mockResolvedValue(suggestions);
    vi.mocked(prisma.theme.upsert).mockResolvedValue({ id: 'theme-1' } as never);

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { discovered: 1 } });
    expect(prisma.theme.upsert).toHaveBeenCalledWith({
      where: { sourceUrl: 'https://example.com/news' },
      create: {
        sourceUrl: 'https://example.com/news',
        headlineSuggestion: 'Editorial headline',
        summary: 'Editorial summary',
        status: 'pending',
      },
      update: {
        headlineSuggestion: 'Editorial headline',
        summary: 'Editorial summary',
      },
    });
  });

  test('returns 500 when discovery fails', async () => {
    // Arrange
    vi.mocked(runScrapeThemes).mockRejectedValue(new Error('scraper unavailable'));

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Theme discovery failed',
    });
  });
});
