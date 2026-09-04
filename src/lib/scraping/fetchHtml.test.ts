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

  test('aborts and throws a clear error when the source hangs past the timeout', async () => {
    // Arrange — a slow/unresponsive source used to hang the whole
    // request (and the whole serverless invocation with it) forever.
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('This operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })),
    );

    // Act — attach the rejection assertion before advancing timers, so
    // the rejection is never briefly unhandled.
    const promise = fetchHtml('https://example.com');
    const assertion = expect(promise).rejects.toThrow('timed out after 10000ms');
    await vi.advanceTimersByTimeAsync(10_000);

    // Assert
    await assertion;
    vi.useRealTimers();
  });
});
