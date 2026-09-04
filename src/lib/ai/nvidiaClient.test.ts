import { describe, test, expect, vi, beforeEach } from 'vitest';

function modelsResponse(ids: string[]): Response {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 });
}

function chatResponse(content: string | null): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

describe('completeWithNvidia', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.NVIDIA_API_KEY = 'test-key';
  });

  test('returns the completion content from NVIDIA', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(modelsResponse(['openai/gpt-oss-20b']))
      .mockResolvedValueOnce(chatResponse('hello from nvidia'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWithNvidia('say hello');

    expect(result).toBe('hello from nvidia');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('throws when NVIDIA returns no content', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(modelsResponse(['openai/gpt-oss-20b']))
        .mockResolvedValueOnce(chatResponse(null)),
    );

    await expect(completeWithNvidia('say hello')).rejects.toThrow('NVIDIA response contained no content');
  });

  test('checks the live catalog before calling, and never calls chat completions for a retired model', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(modelsResponse(['meta/llama-3.2-11b-vision-instruct']));
    vi.stubGlobal('fetch', fetchMock);

    await expect(completeWithNvidia('say hello', 'openai/gpt-oss-120b')).rejects.toThrow(
      'model "openai/gpt-oss-120b" is not in NVIDIA\'s current catalog',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('does not re-list models on every call within the cache window', async () => {
    const { completeWithNvidia } = await import('./nvidiaClient');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(modelsResponse(['openai/gpt-oss-20b']))
      .mockResolvedValueOnce(chatResponse('hi'))
      .mockResolvedValueOnce(chatResponse('hi again'));
    vi.stubGlobal('fetch', fetchMock);

    await completeWithNvidia('one');
    await completeWithNvidia('two');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('aborts and throws a clear error when NVIDIA hangs past the timeout', async () => {
    vi.useFakeTimers();
    const { completeWithNvidia } = await import('./nvidiaClient');
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

    const promise = completeWithNvidia('say hello');
    const assertion = expect(promise).rejects.toThrow('timed out after 20000ms');
    await vi.advanceTimersByTimeAsync(20_000);

    await assertion;
    vi.useRealTimers();
  });
});
