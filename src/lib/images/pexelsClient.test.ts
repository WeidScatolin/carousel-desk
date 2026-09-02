import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { searchPexelsImage } from './pexelsClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('searchPexelsImage', () => {
  beforeEach(() => {
    process.env.PEXELS_API_KEY = 'test-pexels-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PEXELS_API_KEY;
  });

  test('returns the large photo URL for the top search result', async () => {
    // Arrange
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        photos: [{ src: { large: 'https://images.pexels.com/photos/1/photo.jpeg' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Act
    const result = await searchPexelsImage('artificial intelligence chip');

    // Assert
    expect(result).toBe('https://images.pexels.com/photos/1/photo.jpeg');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('query=artificial%20intelligence%20chip'),
      expect.objectContaining({ headers: { Authorization: 'test-pexels-key' } }),
    );
  });

  test('returns null when no photos match the query', async () => {
    // Arrange
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ photos: [] })));

    // Act
    const result = await searchPexelsImage('an extremely obscure query');

    // Assert
    expect(result).toBeNull();
  });

  test('returns null when the request fails instead of throwing', async () => {
    // Arrange
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 500)));

    // Act
    const result = await searchPexelsImage('any query');

    // Assert
    expect(result).toBeNull();
  });

  test('throws when PEXELS_API_KEY is not set', async () => {
    // Arrange
    delete process.env.PEXELS_API_KEY;

    // Act / Assert
    await expect(searchPexelsImage('any query')).rejects.toThrow('PEXELS_API_KEY is not set');
  });
});
