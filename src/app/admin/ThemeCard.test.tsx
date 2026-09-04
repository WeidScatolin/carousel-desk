// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { ThemeCard } from './ThemeCard';
import type { ThemeWithBrief } from '@/lib/data/themes';

function buildTheme(overrides: Partial<ThemeWithBrief> = {}): ThemeWithBrief {
  return {
    id: 'theme-1',
    sourceUrl: 'https://techcrunch.com/some-article',
    summary: 'resumo',
    headlineSuggestion: 'Startup lança agente de IA',
    referenceImageUrls: [],
    status: 'pending',
    rejectionReason: null,
    createdAt: new Date(),
    articleBody: null,
    articleFacts: [],
    articleAuthor: null,
    articlePublishedAt: null,
    hasSufficientEvidence: true,
    contentBrief: null,
    ...overrides,
  } as ThemeWithBrief;
}

function renderCard(theme: ThemeWithBrief): void {
  render(
    <DndContext onDragEnd={() => {}}>
      <ThemeCard theme={theme} column="suggested" />
    </DndContext>,
  );
}

describe('ThemeCard', () => {
  test('renders the score, pillar, goal and strategic rationale when a brief exists', () => {
    renderCard(
      buildTheme({
        contentBrief: {
          id: 'brief-1',
          themeId: 'theme-1',
          postId: null,
          contentPillar: 'radar',
          funnelStage: 'awareness',
          postGoal: 'follow',
          targetPain: 'dor',
          businessApplication: 'aplicação',
          hook: 'gancho',
          hookVariants: [],
          angle: 'ângulo',
          strategicRationale: 'Tema de alta relevância para o público comprador.',
          leadMagnetId: null,
          audienceFitScore: 80,
          businessImpactScore: 70,
          hookPotentialScore: 60,
          evidenceQualityScore: 90,
          offerBridgeScore: 50,
          noveltyScore: 40,
          totalScore: 69,
          createdAt: new Date(),
        },
      }),
    );

    expect(screen.getByText('69')).toBeInTheDocument();
    expect(screen.getByText('Radar')).toBeInTheDocument();
    expect(screen.getByText('Follow')).toBeInTheDocument();
    expect(screen.getByText('Tema de alta relevância para o público comprador.')).toBeInTheDocument();
  });

  test('renders without score/pillar/goal when there is no brief yet', () => {
    renderCard(buildTheme());

    expect(screen.queryByText('Radar')).not.toBeInTheDocument();
  });

  test('warns when the source article has insufficient evidence', () => {
    renderCard(buildTheme({ hasSufficientEvidence: false }));

    expect(screen.getByText(/Evidência insuficiente/)).toBeInTheDocument();
  });

  test('links to the source article', () => {
    renderCard(buildTheme());

    const link = screen.getByRole('link', { name: /Fonte/ });
    expect(link).toHaveAttribute('href', 'https://techcrunch.com/some-article');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
