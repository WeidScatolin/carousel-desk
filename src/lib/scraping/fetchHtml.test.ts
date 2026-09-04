import { afterEach, describe, expect, test, vi } from 'vitest';
import { fetchHtml } from './fetchHtml';

describe('fetchHtml', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('returns the response body text on success', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html></html>', { status: 200 })),
    );

    // Act
    const html = await fetchHtml('https://example.com');

    // Assert
    expect(html).toBe('<html></html>');
  });

  test('throws with the status code when the request fails', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    // Act / Assert
    await expect(fetchHtml('https://example.com')).rejects.toThrow(/503/);
  });
});
