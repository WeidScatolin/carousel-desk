import type { JSX } from 'react';
import { prisma } from '@/lib/prisma';
import { AdminNav } from '../AdminNav';
import { StrategyForm } from './StrategyForm';

export default async function StrategyPage(): Promise<JSX.Element> {
  const strategy = await prisma.brandStrategy.findFirst({ where: { active: true } });

  return (
    <>
      <AdminNav />
      <h1 className="p-5 pb-0 font-heading text-2xl font-extrabold text-carvao">Estratégia da marca</h1>
      <StrategyForm strategy={strategy} />
    </>
  );
}
