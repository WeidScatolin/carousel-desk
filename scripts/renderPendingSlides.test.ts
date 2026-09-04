import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/lib/render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));

import { renderSlideToImage } from '../src/lib/render/renderSlideToImage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('renderPendingSlides', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_URL = 'https://carousel-desk.test';
    process.env.PUBLISH_API_TOKEN = 'publish-secret';
    vi.mocked(renderSlideToImage).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.APP_URL;
    delete process.env.PUBLISH_API_TOKEN;
  });

  test('renders every pending slide and reports each one back as base64', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ slides: [{ id: 's1', postId: 'p1', htmlContent: '<html>1</html>' }, { id: 's2', postId: 'p1', htmlContent: '<html>2</html>' }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));

    await import('./renderPendingSlides');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://carousel-desk.test/api/pipeline/pending-slides',
      expect.objectContaining({ headers: { Authorization: 'Bearer publish-secret' } }),
    );
    expect(renderSlideToImage).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://carousel-desk.test/api/pipeline/slides/s1/render-complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ imageBase64: Buffer.from('fake-png').toString('base64') }),
      }),
    );
  });

  test('keeps going when one slide fails to render, and reports the rest', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ slides: [{ id: 's1', postId: 'p1', htmlContent: '<html>1</html>' }, { id: 's2', postId: 'p1', htmlContent: '<html>2</html>' }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(renderSlideToImage).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(Buffer.from('fake-png'));

    await import('./renderPendingSlides');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Only slide 2 (the one that rendered) gets reported.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
