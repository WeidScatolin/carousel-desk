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

  test('embeds the brand fonts as base64 in every slide, never a remote font request', () => {
    const html = generateSlideHtml({ template: 'editorial_text', headline: 'Título', body: 'Corpo' });

    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  test('highlights accentPhrase only when it is a real substring of the headline', () => {
    const html = generateSlideHtml({
      template: 'editorial_text',
      headline: 'O atendimento manual não escala',
      body: 'Corpo',
      accentPhrase: 'não escala',
    });

    expect(html).toContain(`<span style="color:${'#FF3B0A'}">não escala</span>`);
  });

  test('never auto-highlights a word when no accentPhrase is given, unlike the legacy cover template', () => {
    const html = generateSlideHtml({
      template: 'editorial_text',
      headline: 'Uma manchete qualquer aqui',
      body: 'Corpo',
    });

    expect(html).not.toContain('<span style="color:#FF3B0A">aqui</span>');
  });

  test('ignores an accentPhrase that is not a real substring of the headline', () => {
    const html = generateSlideHtml({
      template: 'editorial_text',
      headline: 'Uma manchete qualquer aqui',
      body: 'Corpo',
      accentPhrase: 'frase que não existe no headline',
    });

    expect(html).not.toContain('<span style="color:#FF3B0A">');
  });

  test('renders kicker and sourceLabel when given', () => {
    const html = generateSlideHtml({
      template: 'evidence',
      headline: 'Os dados mostram X',
      body: 'Resumo',
      kicker: 'Radar',
      sourceLabel: 'TechCrunch, 2026',
    });

    expect(html).toContain('Radar');
    expect(html).toContain('Fonte: TechCrunch, 2026');
  });

  test('renders slide numbering and a progress bar when slideNumber/totalSlides are given', () => {
    const html = generateSlideHtml({
      template: 'editorial_text',
      headline: 'Título',
      body: 'Corpo',
      slideNumber: 3,
      totalSlides: 9,
    });

    expect(html).toContain('03/09');
    expect(html).toContain('width:33%');
  });

  test('renders the instagram handle in the chrome, defaulting when none is given', () => {
    const html = generateSlideHtml({ template: 'editorial_text', headline: 'Título', body: 'Corpo' });

    expect(html).toContain('@carousel-desk');
  });

  test('renders a cinematic cover with a swipe hint when there are multiple slides', () => {
    const html = generateSlideHtml(
      { template: 'cover_cinematic', headline: 'Um agente que responde sozinho', body: 'Subtítulo', slideNumber: 1, totalSlides: 8 },
      'https://example.com/cover.jpg',
    );

    expect(html).toContain('<img src="https://example.com/cover.jpg"');
    expect(html).toContain('arraste');
    expect(html).toContain('01/08');
  });

  test('renders a list_item slide with a numbered marker', () => {
    const html = generateSlideHtml({
      template: 'list_item',
      headline: 'Mapeie seus processos',
      body: 'Liste tudo que é manual hoje.',
      slideNumber: 4,
    });

    expect(html).toContain('>04<');
  });

  test('renders a chat_demo slide as alternating message bubbles, not a literal app screenshot', () => {
    const html = generateSlideHtml({
      template: 'chat_demo',
      headline: 'Como seria a conversa',
      body: 'Oi, preciso de ajuda\nClaro, me conta mais',
    });

    expect(html).toContain('Oi, preciso de ajuda');
    expect(html).toContain('Claro, me conta mais');
    expect(html).not.toContain('WhatsApp');
  });

  test('renders a case_study slide with an accent border and optional image', () => {
    const html = generateSlideHtml(
      { template: 'case_study', headline: 'De 3h para 20min por dia', body: 'Resultado real' },
      'https://example.com/case.jpg',
    );

    expect(html).toContain('border-left:4px solid #FF3B0A');
    expect(html).toContain('<img src="https://example.com/case.jpg"');
  });

  test('renders a risk slide with an accent-bordered warning card', () => {
    const html = generateSlideHtml({
      template: 'risk',
      headline: 'Automação sem revisão humana falha',
      body: 'Sempre valide antes de publicar.',
      kicker: 'Risco',
    });

    expect(html).toContain('border:2px solid #FF3B0A');
    expect(html).toContain('Risco');
  });

  test('renders a cta slide with the keyword as a pill button', () => {
    const html = generateSlideHtml({
      template: 'cta',
      headline: 'Quer o mapa completo?',
      body: 'Comente e eu envio no seu Direct.',
      kicker: 'MAPA',
    });

    expect(html).toContain('MAPA');
    expect(html).toContain('border-radius:999px');
  });
});
