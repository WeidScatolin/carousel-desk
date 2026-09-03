import { describe, expect, test } from 'vitest';
import { normalizeKeyword } from './normalizeKeyword';

describe('normalizeKeyword', () => {
  test('strips accents', () => {
    expect(normalizeKeyword('Diagnóstico')).toBe('DIAGNOSTICO');
  });

  test('is case-insensitive, always returning uppercase', () => {
    expect(normalizeKeyword('mapa')).toBe('MAPA');
    expect(normalizeKeyword('Mapa')).toBe('MAPA');
    expect(normalizeKeyword('MAPA')).toBe('MAPA');
  });

  test('collapses multiple spaces into one and trims edges', () => {
    expect(normalizeKeyword('  quero   o   mapa  ')).toBe('QUERO O MAPA');
  });

  test('handles a keyword with accents and mixed case together', () => {
    expect(normalizeKeyword('  Automação  ')).toBe('AUTOMACAO');
  });
});
