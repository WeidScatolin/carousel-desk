import { prisma } from '@/lib/prisma';
import type { Theme, ThemeStatus } from '@/generated/prisma/client';

export async function listThemesByStatus(status: ThemeStatus): Promise<Theme[]> {
  return prisma.theme.findMany({ where: { status }, orderBy: { createdAt: 'desc' } });
}

export async function listPendingThemes(): Promise<Theme[]> {
  return listThemesByStatus('pending');
}
