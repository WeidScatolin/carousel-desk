import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { listThemesByStatus, listPendingThemes } from './themes';

describe('themes data layer', () => {
  afterEach(async () => {
    await prisma.theme.deleteMany({ where: { sourceUrl: { startsWith: 'https://example.com/themes-data-test' } } });
  });

  test('listThemesByStatus returns only themes with the given status', async () => {
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test-pending',
        summary: 'resumo pendente',
        headlineSuggestion: 'Tema pendente',
        status: 'pending',
      },
    });
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test-approved',
        summary: 'resumo aprovado',
        headlineSuggestion: 'Tema aprovado',
        status: 'approved',
      },
    });

    const pending = await listThemesByStatus('pending');

    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema pendente')).toBe(true);
    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema aprovado')).toBe(false);
  });

  test('includes the theme contentBrief when it exists, and null when it does not', async () => {
    const withBrief = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test-with-brief',
        summary: 'resumo',
        headlineSuggestion: 'Tema com brief',
        status: 'pending',
      },
    });
    await prisma.contentBrief.create({
      data: {
        themeId: withBrief.id,
        contentPillar: 'radar',
        funnelStage: 'awareness',
        postGoal: 'follow',
        targetPain: 'dor',
        businessApplication: 'aplicação',
        hook: 'gancho',
        angle: 'ângulo',
        strategicRationale: 'racional',
        audienceFitScore: 80,
        businessImpactScore: 70,
        hookPotentialScore: 60,
        evidenceQualityScore: 90,
        offerBridgeScore: 50,
        noveltyScore: 40,
        totalScore: 69,
      },
    });
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test-without-brief',
        summary: 'resumo',
        headlineSuggestion: 'Tema sem brief',
        status: 'pending',
      },
    });

    const pending = await listThemesByStatus('pending');

    const found = pending.find((theme) => theme.id === withBrief.id);
    expect(found?.contentBrief?.totalScore).toBe(69);
    const withoutBrief = pending.find((theme) => theme.headlineSuggestion === 'Tema sem brief');
    expect(withoutBrief?.contentBrief).toBeNull();

    await prisma.contentBrief.delete({ where: { themeId: withBrief.id } });
  });

  test('listPendingThemes delegates to listThemesByStatus with pending', async () => {
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test-pending-2',
        summary: 'resumo',
        headlineSuggestion: 'Tema pendente 2',
        status: 'pending',
      },
    });

    const pending = await listPendingThemes();

    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema pendente 2')).toBe(true);
  });
});
