import { describe, expect, test } from 'vitest';
import { loadFontFaceCss } from './loadFonts';

describe('loadFontFaceCss', () => {
  test('embeds all three brand font families as base64 data URIs', () => {
    // Arrange / Act
    const css = loadFontFaceCss();

    // Assert
    expect(css).toContain("font-family:'Barlow Condensed'");
    expect(css).toContain("font-family:'Inter'");
    expect(css).toContain("font-family:'Instrument Serif'");
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toContain('http://');
    expect(css).not.toContain('https://');
  });

  test('returns the same cached string on repeated calls', () => {
    // Arrange / Act
    const first = loadFontFaceCss();
    const second = loadFontFaceCss();

    // Assert
    expect(second).toBe(first);
  });
});
