import { prisma } from '@/lib/prisma';
import type { ContentBrief, Theme, ThemeStatus } from '@/generated/prisma/client';

export interface ThemeWithBrief extends Theme {
  contentBrief: ContentBrief | null;
}

export async function listThemesByStatus(status: ThemeStatus): Promise<ThemeWithBrief[]> {
  return prisma.theme.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: { contentBrief: true },
  });
}

export async function listPendingThemes(): Promise<ThemeWithBrief[]> {
  return listThemesByStatus('pending');
}
