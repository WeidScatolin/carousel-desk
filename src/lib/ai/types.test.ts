import { describe, test, expect } from 'vitest';
import { resolveProvider } from './types';

describe('resolveProvider', () => {
  test('returns nvidia when the env var is set to nvidia', () => {
    const result = resolveProvider('COPYWRITING', {
      PROVIDER_COPYWRITING: 'nvidia',
    } as unknown as NodeJS.ProcessEnv);

    expect(result).toBe('nvidia');
  });

  test('returns claude when the env var is set to claude', () => {
    const result = resolveProvider('IMAGE_ANALYSIS', {
      PROVIDER_IMAGE_ANALYSIS: 'claude',
    } as unknown as NodeJS.ProcessEnv);

    expect(result).toBe('claude');
  });

  test('throws when the env var is missing', () => {
    expect(() => resolveProvider('THEME_SUGGESTION', {} as NodeJS.ProcessEnv)).toThrow(
      'Missing or invalid PROVIDER_THEME_SUGGESTION'
    );
  });

  test('throws when the env var has an invalid value', () => {
    expect(() =>
      resolveProvider('IMAGE_ANALYSIS', { PROVIDER_IMAGE_ANALYSIS: 'gpt4' } as unknown as NodeJS.ProcessEnv)
    ).toThrow('Missing or invalid PROVIDER_IMAGE_ANALYSIS');
  });
});
