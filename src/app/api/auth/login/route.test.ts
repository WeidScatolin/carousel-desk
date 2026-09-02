import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/credentials', () => ({ verifyCredentials: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

import { verifyCredentials } from '@/lib/auth/credentials';
import { getSession } from '@/lib/auth/session';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.mocked(verifyCredentials).mockReset();
    vi.mocked(getSession).mockReset();
  });

  test('returns 400 when the body is missing username or password', async () => {
    const response = await POST(buildRequest({ username: 'admin' }));

    expect(response.status).toBe(400);
  });

  test('returns 401 and does not save a session when credentials are invalid', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(false);

    const response = await POST(buildRequest({ username: 'admin', password: 'wrong' }));

    expect(response.status).toBe(401);
    expect(getSession).not.toHaveBeenCalled();
  });

  test('saves the session and returns 200 when credentials are valid', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(true);
    const save = vi.fn();
    vi.mocked(getSession).mockResolvedValue({ save } as never);

    const response = await POST(buildRequest({ username: 'admin', password: 'correct' }));

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
