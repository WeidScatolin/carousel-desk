import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));
vi.mock('./designSystem', () => ({ loadDesignSystem: () => 'EDITORIAL SYSTEM' }));

import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';
import { scoreTheme, type BrandContext } from './scoreTheme';

const theme = {
  sourceUrl: 'https://techcrunch.com/2026/09/02/some-story/',
  headline: 'Some startup ships an AI feature',
  articleBody: 'The startup raised $10 million and now serves 500 customers.',
  articleFacts: ['The startup raised $10 million.'],
};

const brand: BrandContext = {
  positioning: 'Automação e agentes de IA para PMEs',
  targetAudience: 'Donos de PME',
  coreProblem: 'Processos manuais e atendimento lento',
  promise: 'Reduzir trabalho manual com IA',
  offerDescription: 'Diagnóstico e implementação de automações',
  tone: 'Confiante e analítico',
};

const assessment = {
  audienceFitScore: 80,
  businessImpactScore: 70,
  hookPotentialScore: 60,
  evidenceQualityScore: 90,
  offerBridgeScore: 50,
  noveltyScore: 40,
  contentPillar: 'radar' as const,
  funnelStage: 'awareness' as const,
  postGoal: 'follow' as const,
  targetPain: 'Não sabe por onde começar com IA',
  businessApplication: 'Aplicar o mesmo mecanismo no atendimento',
  angle: 'O que isso significa para PMEs',
  strategicRationale: 'Tema de alta relevância para o público comprador',
  recommendedLeadMagnetKeyword: 'MAPA',
  hookVariants: ['Gancho um', 'Gancho dois', 'Gancho três'],
};

describe('scoreTheme', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('computes totalScore from the weighted subscores, not from the provider', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(assessment));

    // Act
    const result = await scoreTheme(theme, brand, [{ ctaKeyword: 'MAPA', name: 'Mapa', description: 'desc' }]);

    // Assert — 80*0.25 + 70*0.2 + 60*0.15 + 90*0.15 + 50*0.15 + 40*0.1 = 68.5 -> rounds to 69 (or 68)
    const expectedTotal = Math.round(80 * 0.25 + 70 * 0.2 + 60 * 0.15 + 90 * 0.15 + 50 * 0.15 + 40 * 0.1);
    expect(result.totalScore).toBe(expectedTotal);
    expect(completeWithNvidia).toHaveBeenCalledWith(expect.stringContaining('EDITORIAL SYSTEM'));
  });

  test('uses the first hook variant as the chosen hook', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(assessment));

    // Act
    const result = await scoreTheme(theme, brand);

    // Assert
    expect(result.hook).toBe('Gancho um');
    expect(result.hookVariants).toHaveLength(3);
  });

  test('uses Claude when configured and never calls NVIDIA', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(assessment));

    // Act
    await scoreTheme(theme, brand);

    // Assert
    expect(completeWithClaude).toHaveBeenCalledTimes(1);
    expect(completeWithNvidia).not.toHaveBeenCalled();
  });

  test('rejects a response missing required fields', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify({ audienceFitScore: 50 }));

    // Act / Assert
    await expect(scoreTheme(theme, brand)).rejects.toThrow('scoreTheme:');
  });

  test('rejects a score outside 0-100', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify({ ...assessment, audienceFitScore: 150 }));

    // Act / Assert
    await expect(scoreTheme(theme, brand)).rejects.toThrow('scoreTheme:');
  });

  test('rejects a response with the wrong number of hook variants', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(
      JSON.stringify({ ...assessment, hookVariants: ['only one'] }),
    );

    // Act / Assert
    await expect(scoreTheme(theme, brand)).rejects.toThrow('scoreTheme:');
  });

  test('extracts JSON even when the provider wraps it in prose', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(`Here is my analysis:\n\n${JSON.stringify(assessment)}\n\nHope this helps!`);

    // Act
    const result = await scoreTheme(theme, brand);

    // Assert
    expect(result.contentPillar).toBe('radar');
  });
});
