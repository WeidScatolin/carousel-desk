import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { publishCarousel } from './publishCarousel';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('publishCarousel', () => {
  beforeEach(() => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test-access-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });

  test('creates item containers, creates the carousel and publishes it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'item-2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'carousel-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'instagram-post-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishCarousel({
      instagramBusinessAccountId: 'ig-user-1',
      slides: [
        { imageUrl: 'https://cdn.test/slide-1.png' },
        { imageUrl: 'https://cdn.test/slide-2.png' },
      ],
    });

    expect(result).toBe('instagram-post-1');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://graph.instagram.com/v21.0/ig-user-1/media',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          image_url: 'https://cdn.test/slide-1.png',
          is_carousel_item: 'true',
          access_token: 'test-access-token',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://graph.instagram.com/v21.0/ig-user-1/media',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          image_url: 'https://cdn.test/slide-2.png',
          is_carousel_item: 'true',
          access_token: 'test-access-token',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://graph.instagram.com/v21.0/ig-user-1/media',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          media_type: 'CAROUSEL',
          children: 'item-1,item-2',
          access_token: 'test-access-token',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://graph.instagram.com/v21.0/ig-user-1/media_publish',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          creation_id: 'carousel-1',
          access_token: 'test-access-token',
        }),
      })
    );
  });

  test('throws a clear error with the Meta body when an item container fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Unsupported image format' } }, 400)
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publishCarousel({
        instagramBusinessAccountId: 'ig-user-1',
        slides: [
          { imageUrl: 'https://cdn.test/slide-1.png' },
          { imageUrl: 'https://cdn.test/slide-2.png' },
        ],
      })
    ).rejects.toThrow(
      'Instagram Graph API item container failed with 400: {"error":{"message":"Unsupported image format"}}'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('throws a clear error with the Meta body when final publication fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'carousel-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Media is not ready' } }, 500)
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publishCarousel({
        instagramBusinessAccountId: 'ig-user-1',
        slides: [{ imageUrl: 'https://cdn.test/slide-1.png' }],
      })
    ).rejects.toThrow(
      'Instagram Graph API publication failed with 500: {"error":{"message":"Media is not ready"}}'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
