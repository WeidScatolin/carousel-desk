import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { leadMagnetCampaign: { findUniqueOrThrow: vi.fn(), update: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { PATCH } from './route';

const readyCampaign = {
  id: 'campaign-1',
  keyword: 'MAPA',
  assetName: 'Mapa',
  assetUrl: 'https://example.com/mapa.pdf',
  deliveryMessage: 'Aqui está.',
  instagramMediaId: null,
  status: 'DRAFT',
  post: { id: 'post-1', status: 'pending_approval' },
};

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/campaigns/campaign-1', { method: 'PATCH', body: JSON.stringify(body) });
}

describe('PATCH /api/campaigns/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.leadMagnetCampaign.findUniqueOrThrow).mockReset().mockResolvedValue(readyCampaign as never);
    vi.mocked(prisma.leadMagnetCampaign.update).mockReset();
  });

  test('returns 400 for an invalid payload', async () => {
    const response = await PATCH(patchRequest({ assetUrl: 'not-a-url' }), { params: Promise.resolve({ id: 'campaign-1' }) });

    expect(response.status).toBe(400);
    expect(prisma.leadMagnetCampaign.update).not.toHaveBeenCalled();
  });

  test('updates fields that do not activate the campaign without any guardrail check', async () => {
    vi.mocked(prisma.leadMagnetCampaign.update).mockResolvedValue({} as never);

    const response = await PATCH(patchRequest({ deliveryMessage: 'Nova mensagem' }), {
      params: Promise.resolve({ id: 'campaign-1' }),
    });

    expect(response.status).toBe(200);
    expect(prisma.leadMagnetCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { deliveryMessage: 'Nova mensagem' },
    });
  });

  test('activates a fully ready campaign', async () => {
    vi.mocked(prisma.leadMagnetCampaign.update).mockResolvedValue({} as never);

    const response = await PATCH(patchRequest({ status: 'ACTIVE' }), { params: Promise.resolve({ id: 'campaign-1' }) });

    expect(response.status).toBe(200);
    expect(prisma.leadMagnetCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { status: 'ACTIVE' },
    });
  });

  test('returns 422 with blockers instead of activating an unready campaign', async () => {
    vi.mocked(prisma.leadMagnetCampaign.findUniqueOrThrow).mockResolvedValue({
      ...readyCampaign,
      deliveryMessage: '',
    } as never);

    const response = await PATCH(patchRequest({ status: 'ACTIVE' }), { params: Promise.resolve({ id: 'campaign-1' }) });

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.blockers).toContain('A campanha não tem mensagem de entrega.');
    expect(prisma.leadMagnetCampaign.update).not.toHaveBeenCalled();
  });

  test('blocks activation when the post is already published without instagramMediaId', async () => {
    vi.mocked(prisma.leadMagnetCampaign.findUniqueOrThrow).mockResolvedValue({
      ...readyCampaign,
      post: { id: 'post-1', status: 'published' },
    } as never);

    const response = await PATCH(patchRequest({ status: 'ACTIVE' }), { params: Promise.resolve({ id: 'campaign-1' }) });

    expect(response.status).toBe(422);
  });
});
