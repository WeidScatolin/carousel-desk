import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { leadMagnet: { update: vi.fn(), delete: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { PATCH, DELETE } from './route';

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/lead-magnets/lm-1', { method: 'PATCH', body: JSON.stringify(body) });
}

describe('PATCH /api/lead-magnets/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.leadMagnet.update).mockReset();
  });

  test('allows a partial update (e.g. just toggling active)', async () => {
    vi.mocked(prisma.leadMagnet.update).mockResolvedValue({ id: 'lm-1', active: false } as never);

    const response = await PATCH(patchRequest({ active: false }), { params: Promise.resolve({ id: 'lm-1' }) });

    expect(prisma.leadMagnet.update).toHaveBeenCalledWith({ where: { id: 'lm-1' }, data: { active: false } });
    expect(response.status).toBe(200);
  });

  test('returns 400 for an invalid partial payload', async () => {
    const response = await PATCH(patchRequest({ deliveryUrl: 'not-a-url' }), {
      params: Promise.resolve({ id: 'lm-1' }),
    });

    expect(response.status).toBe(400);
    expect(prisma.leadMagnet.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/lead-magnets/[id]', () => {
  test('deletes the lead magnet', async () => {
    vi.mocked(prisma.leadMagnet.delete).mockResolvedValue({} as never);

    const response = await DELETE(new Request('http://localhost/api/lead-magnets/lm-1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'lm-1' }),
    });

    expect(prisma.leadMagnet.delete).toHaveBeenCalledWith({ where: { id: 'lm-1' } });
    expect(response.status).toBe(200);
  });
});
