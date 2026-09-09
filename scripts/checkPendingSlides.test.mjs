import { describe, expect, test, vi } from 'vitest';
import { checkPendingSlides } from './checkPendingSlides.mjs';

describe('checkPendingSlides', () => {
  test('returns the pending count without exposing the pipeline token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slides: [{ id: '1' }, { id: '2' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(checkPendingSlides({
      APP_URL: 'https://carousel-desk.test/',
      PUBLISH_API_TOKEN: 'pipeline-secret',
    }, fetchImpl)).resolves.toBe(2);
    expect(fetchImpl).toHaveBeenCalledWith('https://carousel-desk.test/api/pipeline/pending-slides', expect.objectContaining({
      headers: { Authorization: 'Bearer pipeline-secret' },
    }));
  });

  test('fails closed when configuration or the endpoint is unavailable', async () => {
    await expect(checkPendingSlides({}, vi.fn())).rejects.toThrow('must be configured');
    await expect(checkPendingSlides({
      APP_URL: 'https://carousel-desk.test',
      PUBLISH_API_TOKEN: 'pipeline-secret',
    }, vi.fn().mockResolvedValue(new Response('', { status: 503 })))).rejects.toThrow('lookup failed');
  });
});
