import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));

import { completeWithNvidia } from './nvidiaClient';
import { completeWithClaude } from './claudeClient';
import { writeCopy } from './writeCopy';

describe('writeCopy', () => {
  beforeEach(() => {
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('parses valid JSON copy from the configured provider', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(
      JSON.stringify([{ template: 'cover', headline: 'Título', body: 'Corpo' }])
    );

    const result = await writeCopy({
      headlineSuggestion: 'IA generativa',
      summary: 'resumo',
    });

    expect(result).toEqual([{ template: 'cover', headline: 'Título', body: 'Corpo' }]);
    expect(completeWithClaude).toHaveBeenCalledTimes(1);
    expect(completeWithNvidia).not.toHaveBeenCalled();
  });

  test('throws when provider response is not valid JSON', async () => {
    process.env.PROVIDER_COPYWRITING = 'nvidia';
    vi.mocked(completeWithNvidia).mockResolvedValue('not json');

    await expect(
      writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' })
    ).rejects.toThrow('writeCopy: provider response was not valid JSON');
  });

  test('throws when a slide is missing required fields', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify([{ template: 'cover' }]));

    await expect(
      writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' })
    ).rejects.toThrow('slide at index 0 is missing required fields');
  });

  test('throws when a slide has an invalid template', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(
      JSON.stringify([{ template: 'invalid', headline: 'Título', body: 'Corpo' }])
    );

    await expect(
      writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' })
    ).rejects.toThrow('slide at index 0 has invalid template "invalid"');
  });

  test('strips HTML tags the provider embeds in headline or body', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(
      JSON.stringify([
        {
          template: 'cover',
          headline: 'A nova rota de <span style="color:#FF3B0A">R$100 mi</span> para proteger',
          body: '<p>Corpo com <b>markup</b></p>',
        },
      ])
    );

    const result = await writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' });

    expect(result).toEqual([
      { template: 'cover', headline: 'A nova rota de R$100 mi para proteger', body: 'Corpo com markup' },
    ]);
  });
});
