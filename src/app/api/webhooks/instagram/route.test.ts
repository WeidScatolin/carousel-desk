import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/pipeline/processCommentEvent', () => ({ processCommentEvent: vi.fn() }));

import { processCommentEvent } from '@/lib/pipeline/processCommentEvent';
import { GET, POST } from './route';

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

function postRequest(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {};
  if (signature !== null) {
    headers['x-hub-signature-256'] = signature;
  }
  return new Request('http://localhost/api/webhooks/instagram', { method: 'POST', body, headers });
}

const commentPayload = JSON.stringify({
  entry: [
    {
      changes: [
        {
          field: 'comments',
          value: {
            id: 'comment-1',
            text: 'Quero o MAPA',
            from: { id: 'user-1', username: 'fulano' },
            media: { id: 'media-1' },
          },
        },
      ],
    },
  ],
});

describe('GET /api/webhooks/instagram (verification handshake)', () => {
  beforeEach(() => {
    vi.stubEnv('INSTAGRAM_WEBHOOK_VERIFY_TOKEN', VERIFY_TOKEN);
  });

  test('returns the challenge when the verify token matches', async () => {
    const url = `http://localhost/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`;
    const response = await GET(new Request(url));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('abc123');
  });

  test('returns 403 when the verify token does not match', async () => {
    const url = `http://localhost/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`;
    const response = await GET(new Request(url));

    expect(response.status).toBe(403);
  });

  test('returns 403 when hub.mode is not subscribe', async () => {
    const url = `http://localhost/api/webhooks/instagram?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`;
    const response = await GET(new Request(url));

    expect(response.status).toBe(403);
  });
});

describe('POST /api/webhooks/instagram (comment events)', () => {
  beforeEach(() => {
    vi.stubEnv('INSTAGRAM_APP_SECRET', APP_SECRET);
    vi.mocked(processCommentEvent).mockReset().mockResolvedValue(null);
  });

  test('returns 401 and does not process the event when the signature is missing', async () => {
    const response = await POST(postRequest(commentPayload, null));

    expect(response.status).toBe(401);
    expect(processCommentEvent).not.toHaveBeenCalled();
  });

  test('returns 401 when the signature does not match the body', async () => {
    const response = await POST(postRequest(commentPayload, sign('{"different":"body"}')));

    expect(response.status).toBe(401);
    expect(processCommentEvent).not.toHaveBeenCalled();
  });

  test('processes the comment and returns 200 when the signature is valid', async () => {
    const response = await POST(postRequest(commentPayload, sign(commentPayload)));

    expect(response.status).toBe(200);
    expect(processCommentEvent).toHaveBeenCalledWith({
      instagramCommentId: 'comment-1',
      instagramMediaId: 'media-1',
      instagramUserId: 'user-1',
      instagramUsername: 'fulano',
      originalComment: 'Quero o MAPA',
    });
  });

  test('a redelivered webhook for the same comment still returns 200 both times', async () => {
    const signature = sign(commentPayload);

    const first = await POST(postRequest(commentPayload, signature));
    const second = await POST(postRequest(commentPayload, signature));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(processCommentEvent).toHaveBeenCalledTimes(2);
  });

  test('ignores non-comments changes and still returns 200', async () => {
    const otherPayload = JSON.stringify({
      entry: [{ changes: [{ field: 'mentions', value: {} }] }],
    });

    const response = await POST(postRequest(otherPayload, sign(otherPayload)));

    expect(response.status).toBe(200);
    expect(processCommentEvent).not.toHaveBeenCalled();
  });
});
