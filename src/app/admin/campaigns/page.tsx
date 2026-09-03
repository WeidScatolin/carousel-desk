import type { JSX } from 'react';
import { prisma } from '@/lib/prisma';
import { AdminNav } from '../AdminNav';
import { CampaignsManager } from './CampaignsManager';

export default async function CampaignsPage(): Promise<JSX.Element> {
  const campaigns = await prisma.leadMagnetCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { post: { include: { theme: true } }, leadMagnet: true },
  });

  return (
    <>
      <AdminNav />
      <h1 className="p-4 pb-0 text-lg font-bold">Campanhas de comentário → DM</h1>
      <CampaignsManager campaigns={campaigns} />
    </>
  );
}
