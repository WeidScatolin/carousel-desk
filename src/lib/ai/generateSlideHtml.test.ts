import { describe, test, expect } from 'vitest';
import { generateSlideHtml } from './generateSlideHtml';

describe('generateSlideHtml', () => {
  test('renders a cover slide with the dark background and an accented headline', () => {
    const html = generateSlideHtml({ template: 'cover', headline: 'IA muda o jogo', body: 'Resumo' });

    expect(html).toContain('#0A0A0A');
    expect(html).toContain('IA muda o');
    expect(html).toContain('#FF3B0A');
  });

  test('renders an evidence slide with the cream background', () => {
    const html = generateSlideHtml({ template: 'evidence', headline: 'Os dados mostram X', body: 'Resumo' });

    expect(html).toContain('#F2F0E8');
    expect(html).toContain('Resumo');
  });

  test('renders a framework slide as a checklist when the body has multiple lines', () => {
    const html = generateSlideHtml({
      template: 'framework',
      headline: 'Modelo 01',
      body: 'Primeiro passo\nSegundo passo',
    });

    expect(html).toContain('<ul');
    expect(html).toContain('Primeiro passo');
    expect(html).toContain('Segundo passo');
  });

  test('escapes HTML special characters in the headline and body', () => {
    const html = generateSlideHtml({
      template: 'cover',
      headline: 'Menos <script> mais resultado',
      body: '<b>teste</b>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;teste&lt;/b&gt;');
  });

  test('keeps the headline style attribute well-formed (no embedded double quotes)', () => {
    const html = generateSlideHtml({ template: 'cover', headline: 'IA muda o jogo', body: 'Resumo' });

    const headingTag = html.match(/<h1[^>]*>/)?.[0] ?? '';
    const styleValue = headingTag.match(/style="([^]*?)"/)?.[1] ?? '';

    expect(styleValue).not.toContain('"');
    expect(styleValue).toContain('font-family');
  });

  test('renders a full-bleed background photo with a darkened overlay on the cover slide when an image is given', () => {
    const html = generateSlideHtml(
      { template: 'cover', headline: 'IA muda o jogo', body: 'Resumo' },
      'https://example.com/cover.jpg',
    );

    expect(html).toContain('<img src="https://example.com/cover.jpg"');
    expect(html).toContain('object-fit:cover');
    expect(html).toContain('linear-gradient');
  });

  test('omits the background image markup on the cover slide when no image is given', () => {
    const html = generateSlideHtml({ template: 'cover', headline: 'IA muda o jogo', body: 'Resumo' });

    expect(html).not.toContain('<img');
  });

  test('renders a small support image on the evidence slide when an image is given', () => {
    const html = generateSlideHtml(
      { template: 'evidence', headline: 'Os dados mostram X', body: 'Resumo' },
      'https://example.com/evidence.jpg',
    );

    expect(html).toContain('<img src="https://example.com/evidence.jpg"');
    expect(html).toContain('height:320px');
  });

  test('ignores an image URL on the framework slide (no image in this template)', () => {
    const html = generateSlideHtml(
      { template: 'framework', headline: 'Modelo 01', body: 'Passo único' },
      'https://example.com/framework.jpg',
    );

    expect(html).not.toContain('<img');
  });
});
