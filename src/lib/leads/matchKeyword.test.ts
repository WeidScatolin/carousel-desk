import { describe, expect, test } from 'vitest';
import { matchesKeyword } from './matchKeyword';

describe('matchesKeyword — CONTAINS_WORD', () => {
  test.each([
    'MAPA',
    'mapa',
    'Mapa',
    '"MAPA"',
    'Quero o MAPA',
    'MAPA, por favor',
  ])('matches %s', (comment) => {
    expect(matchesKeyword(comment, 'MAPA', 'CONTAINS_WORD')).toBe(true);
  });

  test.each(['MAPAS', 'AMAPA', 'MAPA123', 'sem palavra nenhuma'])('does not match %s (not a whole word)', (comment) => {
    expect(matchesKeyword(comment, 'MAPA', 'CONTAINS_WORD')).toBe(false);
  });

  test('matches regardless of accent/case differences between comment and keyword', () => {
    expect(matchesKeyword('quero o diagnóstico agora', 'Diagnostico', 'CONTAINS_WORD')).toBe(true);
  });

  test('matches the keyword at the very start or end of the comment', () => {
    expect(matchesKeyword('MAPA por favor', 'MAPA', 'CONTAINS_WORD')).toBe(true);
    expect(matchesKeyword('quero o MAPA', 'MAPA', 'CONTAINS_WORD')).toBe(true);
  });
});

describe('matchesKeyword — EXACT', () => {
  test('matches only when the whole normalized comment equals the keyword', () => {
    expect(matchesKeyword('mapa', 'MAPA', 'EXACT')).toBe(true);
    expect(matchesKeyword('  Mapa  ', 'mapa', 'EXACT')).toBe(true);
  });

  test('does not match when the comment has extra words', () => {
    expect(matchesKeyword('Quero o MAPA', 'MAPA', 'EXACT')).toBe(false);
  });
});

describe('matchesKeyword — edge cases', () => {
  test('never matches an empty keyword', () => {
    expect(matchesKeyword('qualquer coisa', '', 'CONTAINS_WORD')).toBe(false);
  });
});
