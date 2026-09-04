import type { JSX } from 'react';
import { prisma } from '@/lib/prisma';
import { AdminNav } from '../AdminNav';
import { LeadMagnetsManager } from './LeadMagnetsManager';

export default async function LeadMagnetsPage(): Promise<JSX.Element> {
  const leadMagnets = await prisma.leadMagnet.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <>
      <AdminNav />
      <h1 className="p-4 pb-0 text-lg font-bold">Lead magnets</h1>
      <LeadMagnetsManager leadMagnets={leadMagnets} />
    </>
  );
}
