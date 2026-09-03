import { describe, test, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { leadMagnetCampaign: { findMany: vi.fn() } },
}));

import { prisma } from '@/lib/prisma';
import { GET } from './route';

describe('GET /api/campaigns', () => {
  test('lists campaigns with their post/theme and lead magnet included', async () => {
    vi.mocked(prisma.leadMagnetCampaign.findMany).mockResolvedValue([{ id: 'campaign-1' }] as never);

    const response = await GET();

    expect(prisma.leadMagnetCampaign.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { post: { include: { theme: true } }, leadMagnet: true },
    });
    expect(response.status).toBe(200);
  });
});
