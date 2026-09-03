import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  MockPrivateReplyProvider,
  MetaPrivateReplyProvider,
  getPrivateReplyProvider,
} from './privateReplyProvider';

describe('MockPrivateReplyProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('never calls fetch and always returns success', async () => {
    const provider = new MockPrivateReplyProvider();

    const result = await provider.sendPrivateReply({ commentId: 'comment-1', message: 'Oi!' });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, externalMessageId: 'simulated-comment-1' });
  });
});

describe('getPrivateReplyProvider (feature flag)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  test('returns the mock provider when the flag is unset', () => {
    expect(getPrivateReplyProvider()).toBeInstanceOf(MockPrivateReplyProvider);
  });

  test.each(['false', 'TRUE', '1', 'yes', ''])('returns the mock provider for any non-"true" value (%s)', (value) => {
    vi.stubEnv('INSTAGRAM_PRIVATE_REPLIES_ENABLED', value);
    expect(getPrivateReplyProvider()).toBeInstanceOf(MockPrivateReplyProvider);
  });

  test('returns the real Meta provider only when the flag is exactly "true"', () => {
    vi.stubEnv('INSTAGRAM_PRIVATE_REPLIES_ENABLED', 'true');
    expect(getPrivateReplyProvider()).toBeInstanceOf(MetaPrivateReplyProvider);
  });
});

describe('MetaPrivateReplyProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('INSTAGRAM_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', 'ig-user-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('sends the comment id and message via the messages endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message_id: 'msg-1' }), { status: 200 }),
    );
    const provider = new MetaPrivateReplyProvider();

    const result = await provider.sendPrivateReply({ commentId: 'comment-1', message: 'Aqui está o material.' });

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.instagram.com/v21.0/ig-user-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          recipient: { comment_id: 'comment-1' },
          message: { text: 'Aqui está o material.' },
        }),
      }),
    );
    expect(result).toEqual({ success: true, externalMessageId: 'msg-1' });
  });

  test('returns success:false with the Graph API error body on failure, without throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'duplicate private reply' } }), { status: 400 }),
    );
    const provider = new MetaPrivateReplyProvider();

    const result = await provider.sendPrivateReply({ commentId: 'comment-1', message: 'Oi!' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('duplicate private reply');
  });

  test('returns success:false when the request itself throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'));
    const provider = new MetaPrivateReplyProvider();

    const result = await provider.sendPrivateReply({ commentId: 'comment-1', message: 'Oi!' });

    expect(result).toEqual({ success: false, error: 'network unreachable' });
  });
});
