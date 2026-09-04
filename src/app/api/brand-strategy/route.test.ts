import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { brandStrategy: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { GET, PATCH } from './route';

const validPayload = {
  name: 'Estratégia padrão',
  positioning: 'pos',
  targetAudience: 'aud',
  coreProblem: 'problem',
  promise: 'promise',
  offerDescription: 'offer',
  tone: 'tone',
  defaultCtaKeyword: 'MAPA',
  instagramHandle: '@carousel-desk',
};

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/brand-strategy', { method: 'PATCH', body: JSON.stringify(body) });
}

describe('GET /api/brand-strategy', () => {
  beforeEach(() => {
    vi.mocked(prisma.brandStrategy.findFirst).mockReset();
    vi.mocked(prisma.brandStrategy.update).mockReset();
    vi.mocked(prisma.brandStrategy.create).mockReset();
  });

  test('returns the active strategy', async () => {
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue({ id: 'brand-1', ...validPayload } as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ strategy: { id: 'brand-1', ...validPayload } });
  });

  test('returns null when no active strategy exists yet', async () => {
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(null);

    const response = await GET();

    expect(await response.json()).toEqual({ strategy: null });
  });
});

describe('PATCH /api/brand-strategy', () => {
  beforeEach(() => {
    vi.mocked(prisma.brandStrategy.findFirst).mockReset();
    vi.mocked(prisma.brandStrategy.update).mockReset();
    vi.mocked(prisma.brandStrategy.create).mockReset();
  });

  test('returns 400 for an invalid payload', async () => {
    const response = await PATCH(patchRequest({ name: '' }));

    expect(response.status).toBe(400);
  });

  test('updates the existing active strategy', async () => {
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue({ id: 'brand-1' } as never);
    vi.mocked(prisma.brandStrategy.update).mockResolvedValue({ id: 'brand-1', ...validPayload } as never);

    const response = await PATCH(patchRequest(validPayload));

    expect(prisma.brandStrategy.update).toHaveBeenCalledWith({ where: { id: 'brand-1' }, data: validPayload });
    expect(prisma.brandStrategy.create).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  test('creates a new active strategy when none exists yet', async () => {
    vi.mocked(prisma.brandStrategy.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.brandStrategy.create).mockResolvedValue({ id: 'brand-2', ...validPayload } as never);

    await PATCH(patchRequest(validPayload));

    expect(prisma.brandStrategy.create).toHaveBeenCalledWith({ data: { ...validPayload, active: true } });
  });
});
