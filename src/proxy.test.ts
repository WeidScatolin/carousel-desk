import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('iron-session', () => ({ unsealData: vi.fn() }));

import { unsealData } from 'iron-session';
import { proxy } from './proxy';

function buildRequest(path: string, cookieValue?: string): NextRequest {
  const request = new NextRequest(new URL(path, 'http://localhost'));
  if (cookieValue) {
    request.cookies.set('carousel-desk-session', cookieValue);
  }
  return request;
}

describe('proxy', () => {
  beforeEach(() => {
    vi.mocked(unsealData).mockReset();
    process.env.SESSION_SECRET = 'a'.repeat(32);
  });

  test('lets through requests to /admin/login without a session', async () => {
    const response = await proxy(buildRequest('/admin/login'));

    expect(response.status).toBe(200);
  });

  test('redirects to /admin/login when there is no session cookie', async () => {
    const response = await proxy(buildRequest('/admin'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/login');
  });

  test('redirects to /admin/login when the session is not logged in', async () => {
    vi.mocked(unsealData).mockResolvedValue({ isLoggedIn: false });

    const response = await proxy(buildRequest('/admin', 'sealed-value'));

    expect(response.status).toBe(307);
  });

  test('allows the request through for a logged-in session on an admin page', async () => {
    vi.mocked(unsealData).mockResolvedValue({ isLoggedIn: true, username: 'admin' });

    const response = await proxy(buildRequest('/admin', 'sealed-value'));

    expect(response.status).toBe(200);
  });

  test('returns 401 JSON (not a redirect) for a protected API route without a session', async () => {
    const response = await proxy(buildRequest('/api/themes/abc/approve'));

    expect(response.status).toBe(401);
  });

  test('allows a protected API route through for a logged-in session', async () => {
    vi.mocked(unsealData).mockResolvedValue({ isLoggedIn: true, username: 'admin' });

    const response = await proxy(buildRequest('/api/posts/abc/reject', 'sealed-value'));

    expect(response.status).toBe(200);
  });

  test.each(['/api/brand-strategy', '/api/lead-magnets', '/api/comment-automations/abc'])(
    'returns 401 for %s without a session',
    async (path) => {
      const response = await proxy(buildRequest(path));

      expect(response.status).toBe(401);
    },
  );
});
