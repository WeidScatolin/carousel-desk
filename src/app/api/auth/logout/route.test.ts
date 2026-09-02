import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

import { getSession } from '@/lib/auth/session';
import { POST } from './route';

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
  });

  test('destroys the session and returns 200', async () => {
    const destroy = vi.fn();
    vi.mocked(getSession).mockResolvedValue({ destroy } as never);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
