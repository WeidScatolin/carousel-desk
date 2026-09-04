import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { composeReplyMessage, deliverCommentReply } from './deliverCommentReply';

describe('composeReplyMessage', () => {
  test('appends the asset url on a new line when present', () => {
    expect(composeReplyMessage({ replyMessage: 'Aqui está!', assetUrl: 'https://example.com/mapa.pdf' })).toBe(
      'Aqui está!\nhttps://example.com/mapa.pdf',
    );
  });

  test('returns just the message when there is no asset url', () => {
    expect(composeReplyMessage({ replyMessage: 'Aqui está!', assetUrl: null })).toBe('Aqui está!');
  });
});

describe('deliverCommentReply', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('returns SIMULATED and never calls fetch when the feature flag is off', async () => {
    const outcome = await deliverCommentReply('comment-1', 'Oi!');

    expect(fetch).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'SIMULATED', externalMessageId: 'simulated-comment-1', lastError: null });
  });

  test('returns SENT when the real provider succeeds', async () => {
    vi.stubEnv('INSTAGRAM_PRIVATE_REPLIES_ENABLED', 'true');
    vi.stubEnv('INSTAGRAM_ACCESS_TOKEN', 'token');
    vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', 'ig-user-1');
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message_id: 'msg-1' }), { status: 200 }));

    const outcome = await deliverCommentReply('comment-1', 'Oi!');

    expect(outcome).toEqual({ status: 'SENT', externalMessageId: 'msg-1', lastError: null });
  });

  test('returns FAILED with the sanitized error when the real provider fails', async () => {
    vi.stubEnv('INSTAGRAM_PRIVATE_REPLIES_ENABLED', 'true');
    vi.stubEnv('INSTAGRAM_ACCESS_TOKEN', 'token');
    vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', 'ig-user-1');
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 400 }));

    const outcome = await deliverCommentReply('comment-1', 'Oi!');

    expect(outcome.status).toBe('FAILED');
    expect(outcome.lastError).toContain('boom');
  });
});
