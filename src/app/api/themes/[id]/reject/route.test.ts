import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { theme: { update: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/themes/theme-1/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/themes/[id]/reject', () => {
  beforeEach(() => {
    vi.mocked(prisma.theme.update).mockReset();
  });

  test('returns 400 when reason is missing', async () => {
    const response = await POST(buildRequest({}), { params: Promise.resolve({ id: 'theme-1' }) });

    expect(response.status).toBe(400);
    expect(prisma.theme.update).not.toHaveBeenCalled();
  });

  test('marks the theme rejected with the given reason', async () => {
    const response = await POST(buildRequest({ reason: 'fora do nicho' }), {
      params: Promise.resolve({ id: 'theme-1' }),
    });

    expect(prisma.theme.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: { status: 'rejected', rejectionReason: 'fora do nicho' },
    });
    expect(response.status).toBe(200);
  });
});
