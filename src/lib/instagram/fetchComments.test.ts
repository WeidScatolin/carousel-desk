import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchAllComments, InstagramAuthError, InstagramRateLimitError } from './fetchComments';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchAllComments', () => {
  beforeEach(() => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });

  test('requests only the needed fields with the access token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllComments('media-1');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/media-1/comments?');
    expect(url).toContain('fields=id%2Ctext%2Cusername%2Ctimestamp');
    expect(url).toContain('access_token=test-token');
  });

  test('returns comments from a single page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ data: [{ id: 'c1', text: 'MAPA', username: 'joao', timestamp: '2026-01-01T00:00:00Z' }] }),
      ),
    );

    const comments = await fetchAllComments('media-1');

    expect(comments).toEqual([{ id: 'c1', text: 'MAPA', username: 'joao', timestamp: '2026-01-01T00:00:00Z' }]);
  });

  test('follows pagination until there is no next cursor', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'c1', text: 'a', username: null, timestamp: 't1' }],
          paging: { cursors: { after: 'cursor-1' }, next: 'https://graph.instagram.com/next' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'c2', text: 'b', username: null, timestamp: 't2' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const comments = await fetchAllComments('media-1');

    expect(comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('after=cursor-1');
  });

  test('throws InstagramRateLimitError on 429', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: 'rate limited' } }, 429)));

    await expect(fetchAllComments('media-1')).rejects.toBeInstanceOf(InstagramRateLimitError);
  });

  test('throws InstagramAuthError on an OAuth error code without leaking the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: 'Token expired', code: 190 } }, 401)),
    );

    await expect(fetchAllComments('media-1')).rejects.toBeInstanceOf(InstagramAuthError);
    try {
      await fetchAllComments('media-1');
    } catch (error) {
      expect(String(error)).not.toContain('test-token');
    }
  });

  test('throws a generic sanitized error for other failures', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: 'Media not found' } }, 400)));

    await expect(fetchAllComments('media-1')).rejects.toThrow('Media not found');
  });

  test('throws on an unexpected response shape', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ nope: true })));

    await expect(fetchAllComments('media-1')).rejects.toThrow('unexpected response shape');
  });

  test('never makes a real network call in tests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllComments('media-1');

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('graph.instagram.com');
    }
  });
});
