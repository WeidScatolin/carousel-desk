import { describe, test, expect } from 'vitest';
import { loadDesignSystem } from './designSystem';

describe('loadDesignSystem', () => {
  test('loads the brand system content including the color palette', () => {
    const content = loadDesignSystem();

    expect(content).toContain('#FF3B0A');
    expect(content).toContain('cover (capa cinematográfica)');
  });
});
