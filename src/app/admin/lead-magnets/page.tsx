import type { JSX } from 'react';
import { prisma } from '@/lib/prisma';
import { AdminNav } from '../AdminNav';
import { LeadMagnetsManager } from './LeadMagnetsManager';

export default async function LeadMagnetsPage(): Promise<JSX.Element> {
  const leadMagnets = await prisma.leadMagnet.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <>
      <AdminNav />
      <h1 className="p-5 pb-0 font-heading text-xl font-bold text-carvao">Lead magnets</h1>
      <LeadMagnetsManager leadMagnets={leadMagnets} />
    </>
  );
}
