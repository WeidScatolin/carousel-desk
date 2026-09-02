import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { listThemesByStatus, listPendingThemes } from './themes';

describe('themes data layer', () => {
  afterEach(async () => {
    await prisma.theme.deleteMany({ where: { sourceUrl: 'https://example.com/themes-data-test' } });
  });

  test('listThemesByStatus returns only themes with the given status', async () => {
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test',
        summary: 'resumo pendente',
        headlineSuggestion: 'Tema pendente',
        status: 'pending',
      },
    });
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test',
        summary: 'resumo aprovado',
        headlineSuggestion: 'Tema aprovado',
        status: 'approved',
      },
    });

    const pending = await listThemesByStatus('pending');

    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema pendente')).toBe(true);
    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema aprovado')).toBe(false);
  });

  test('listPendingThemes delegates to listThemesByStatus with pending', async () => {
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test',
        summary: 'resumo',
        headlineSuggestion: 'Tema pendente 2',
        status: 'pending',
      },
    });

    const pending = await listPendingThemes();

    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema pendente 2')).toBe(true);
  });
});
