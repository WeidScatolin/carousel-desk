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
});
