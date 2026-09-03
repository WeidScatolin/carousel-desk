import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));
vi.mock('./designSystem', () => ({ loadDesignSystem: () => 'EDITORIAL SYSTEM' }));

import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';
import { writeCarouselCopy, type CarouselCopyBrand, type CarouselCopyBrief, type CarouselCopyThemeInput } from './writeCarouselCopy';

const theme: CarouselCopyThemeInput = {
  headline: 'Startup lança agente de IA para atendimento',
  articleBody: 'A startup processa 10 mil tickets por mês com o novo agente.',
  articleFacts: ['A startup processa 10 mil tickets por mês.'],
};

const brand: CarouselCopyBrand = {
  positioning: 'pos',
  targetAudience: 'PMEs',
  promise: 'Reduzir trabalho manual',
  tone: 'Confiante',
  instagramHandle: '@carousel-desk',
};

const followBrief: CarouselCopyBrief = {
  contentPillar: 'radar',
  funnelStage: 'awareness',
  postGoal: 'follow',
  targetPain: 'Não sabe por onde começar',
  businessApplication: 'Aplicar no atendimento',
  angle: 'O que isso significa para PMEs',
  hook: 'Um agente que responde sozinho',
  hookVariants: ['a', 'b', 'c'],
};

const commentDmBrief: CarouselCopyBrief = { ...followBrief, postGoal: 'comment_dm' };

function buildSlide(overrides: Record<string, unknown> = {}) {
  return {
    role: 'problem',
    template: 'editorial_text',
    headline: 'O atendimento manual não escala',
    body: 'Times pequenos não conseguem responder tudo a tempo.',
    accentPhrase: 'não escala',
    kicker: null,
    sourceLabel: null,
    visualType: 'typography_only',
    visualInstructions: null,
    ...overrides,
  };
}

function buildValidResponse(overrides: { slides?: unknown[]; ctaKeyword?: string | null } = {}) {
  const middleSlides = Array.from({ length: 5 }, () => buildSlide());
  return {
    hookVariants: ['Gancho um', 'Gancho dois', 'Gancho três'],
    hook: 'Gancho um',
    caption: 'Legenda de teste\ncom quebra de linha.',
    ctaKeyword: overrides.ctaKeyword ?? null,
    slides: overrides.slides ?? [
      buildSlide({ role: 'cover', template: 'cover_cinematic', headline: 'Um agente que responde sozinho', accentPhrase: null }),
      ...middleSlides,
    ],
  };
}

describe('writeCarouselCopy', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('parses a valid response and returns the full contract', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(buildValidResponse()));

    // Act
    const result = await writeCarouselCopy(theme, followBrief, brand);

    // Assert
    expect(result.hook).toBe('Gancho um');
    expect(result.hookVariants).toHaveLength(3);
    expect(result.slides).toHaveLength(6);
    expect(result.slides[0]?.role).toBe('cover');
    expect(completeWithClaude).toHaveBeenCalledWith(expect.stringContaining('EDITORIAL SYSTEM'));
  });

  test('rejects fewer than 6 slides', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(
      JSON.stringify(
        buildValidResponse({
          slides: [buildSlide({ role: 'cover', template: 'cover_cinematic' })],
        }),
      ),
    );

    // Act / Assert
    await expect(writeCarouselCopy(theme, followBrief, brand)).rejects.toThrow('writeCarouselCopy:');
  });

  test('rejects more than 13 slides', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const slides = [
      buildSlide({ role: 'cover', template: 'cover_cinematic' }),
      ...Array.from({ length: 13 }, () => buildSlide()),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ slides })));

    // Act / Assert
    await expect(writeCarouselCopy(theme, followBrief, brand)).rejects.toThrow('writeCarouselCopy:');
  });

  test('rejects a carousel whose first slide is not the cover role', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const slides = Array.from({ length: 6 }, () => buildSlide());
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ slides })));

    // Act / Assert
    await expect(writeCarouselCopy(theme, followBrief, brand)).rejects.toThrow(
      'the first slide must have role "cover"',
    );
  });

  test('rejects a cover headline over 18 words', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const longHeadline = Array.from({ length: 19 }, (_, i) => `palavra${i}`).join(' ');
    const slides = [
      buildSlide({ role: 'cover', template: 'cover_cinematic', headline: longHeadline, accentPhrase: null }),
      ...Array.from({ length: 5 }, () => buildSlide()),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ slides })));

    // Act / Assert
    await expect(writeCarouselCopy(theme, followBrief, brand)).rejects.toThrow('exceeding the 18-word limit');
  });

  test('rejects a slide body over the mobile-readability character limit', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const longBody = 'a'.repeat(281);
    const slides = [
      buildSlide({ role: 'cover', template: 'cover_cinematic', accentPhrase: null }),
      buildSlide({ body: longBody }),
      ...Array.from({ length: 4 }, () => buildSlide()),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ slides })));

    // Act / Assert
    await expect(writeCarouselCopy(theme, followBrief, brand)).rejects.toThrow('exceeding the 280-character limit');
  });

  test('requires a trailing cta slide when postGoal is comment_dm', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ ctaKeyword: 'MAPA' })));

    // Act / Assert — buildValidResponse's default slides end in role "problem", not "cta"
    await expect(writeCarouselCopy(theme, commentDmBrief, brand)).rejects.toThrow(
      'must end with a "cta" slide',
    );
  });

  test('accepts a comment_dm carousel that ends with a cta slide', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const slides = [
      buildSlide({ role: 'cover', template: 'cover_cinematic', accentPhrase: null }),
      ...Array.from({ length: 4 }, () => buildSlide()),
      buildSlide({ role: 'cta', template: 'cta', accentPhrase: null }),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(
      JSON.stringify(buildValidResponse({ slides, ctaKeyword: 'mapa' })),
    );

    // Act
    const result = await writeCarouselCopy(theme, commentDmBrief, brand);

    // Assert
    expect(result.ctaKeyword).toBe('MAPA');
    expect(result.slides.at(-1)?.role).toBe('cta');
  });

  test('strips HTML and markdown from headline, body and caption', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const slides = [
      buildSlide({
        role: 'cover',
        template: 'cover_cinematic',
        headline: '<b>Um agente</b> que responde',
        accentPhrase: null,
      }),
      buildSlide({ body: 'Corpo com **negrito** e `código`.' }),
      ...Array.from({ length: 4 }, () => buildSlide()),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(
      JSON.stringify(buildValidResponse({ slides })),
    );

    // Act
    const result = await writeCarouselCopy(theme, followBrief, brand);

    // Assert
    expect(result.slides[0]?.headline).toBe('Um agente que responde');
    expect(result.slides[1]?.body).toBe('Corpo com negrito e código.');
  });

  test('nulls out an accentPhrase that is not a real substring of the headline', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const slides = [
      buildSlide({ role: 'cover', template: 'cover_cinematic', accentPhrase: null }),
      buildSlide({ headline: 'O atendimento manual não escala', accentPhrase: 'frase inventada' }),
      ...Array.from({ length: 4 }, () => buildSlide()),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ slides })));

    // Act
    const result = await writeCarouselCopy(theme, followBrief, brand);

    // Assert
    expect(result.slides[1]?.accentPhrase).toBeNull();
  });

  test('keeps an accentPhrase that is a real substring of the headline', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    const slides = [
      buildSlide({ role: 'cover', template: 'cover_cinematic', accentPhrase: null }),
      buildSlide({ headline: 'O atendimento manual não escala', accentPhrase: 'não escala' }),
      ...Array.from({ length: 4 }, () => buildSlide()),
    ];
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(buildValidResponse({ slides })));

    // Act
    const result = await writeCarouselCopy(theme, followBrief, brand);

    // Assert
    expect(result.slides[1]?.accentPhrase).toBe('não escala');
  });

  test('rejects invalid JSON from the provider', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_COPYWRITING', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue('not json at all');

    // Act / Assert
    await expect(writeCarouselCopy(theme, followBrief, brand)).rejects.toThrow('writeCarouselCopy:');
  });
});
