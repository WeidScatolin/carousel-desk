import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { leadMagnet: { findMany: vi.fn(), create: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { GET, POST } from './route';

const validPayload = {
  name: 'Mapa de Oportunidades',
  description: 'desc',
  deliveryUrl: 'https://example.com/mapa.pdf',
  ctaKeyword: 'mapa',
  qualificationQuestion: 'Qual área consome mais tempo?',
};

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/lead-magnets', { method: 'POST', body: JSON.stringify(body) });
}

describe('GET /api/lead-magnets', () => {
  test('lists lead magnets newest first', async () => {
    vi.mocked(prisma.leadMagnet.findMany).mockResolvedValue([{ id: 'lm-1' }] as never);

    const response = await GET();

    expect(prisma.leadMagnet.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    expect(response.status).toBe(200);
  });
});

describe('POST /api/lead-magnets', () => {
  beforeEach(() => {
    vi.mocked(prisma.leadMagnet.create).mockReset();
  });

  test('returns 400 for an invalid deliveryUrl', async () => {
    const response = await POST(postRequest({ ...validPayload, deliveryUrl: 'not-a-url' }));

    expect(response.status).toBe(400);
    expect(prisma.leadMagnet.create).not.toHaveBeenCalled();
  });

  test('uppercases the ctaKeyword and defaults active to true', async () => {
    vi.mocked(prisma.leadMagnet.create).mockResolvedValue({ id: 'lm-1' } as never);

    const response = await POST(postRequest(validPayload));

    expect(prisma.leadMagnet.create).toHaveBeenCalledWith({
      data: { ...validPayload, ctaKeyword: 'MAPA', active: true },
    });
    expect(response.status).toBe(201);
  });

  test('respects an explicit active:false', async () => {
    vi.mocked(prisma.leadMagnet.create).mockResolvedValue({ id: 'lm-1' } as never);

    await POST(postRequest({ ...validPayload, active: false }));

    expect(prisma.leadMagnet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });
});
