import { loadFontFaceCss } from '../render/loadFonts';
import type { SlideTemplateName } from './writeCarouselCopy';

export type FullSlideTemplate = SlideTemplateName | 'cover';

export interface SlideRenderInput {
  template: FullSlideTemplate;
  headline: string;
  body: string;
  accentPhrase?: string | null;
  kicker?: string | null;
  sourceLabel?: string | null;
  visualInstructions?: string | null;
  slideNumber?: number | null;
  totalSlides?: number | null;
  instagramHandle?: string | null;
}

const PALETTE = {
  charcoal: '#0A0A0A',
  cream: '#F2F0E8',
  accent: '#FF3B0A',
  purpleBlack: '#11101D',
} as const;

const HEADLINE_FONT_STACK = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const BODY_FONT_STACK = "'Inter', Arial, Helvetica, sans-serif";
const KICKER_FONT_STACK = "'Inter', Arial, sans-serif";
const SERIF_FONT_STACK = "'Instrument Serif', Georgia, serif";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Legacy behavior for the frozen "cover" template only: highlights the
// last word automatically. Every other template uses
// renderHeadlineWithAccentPhrase below instead, which never guesses —
// it only highlights a phrase the copy explicitly named.
function renderHeadlineWithLastWordAccent(headline: string): string {
  const words = headline.trim().split(/\s+/);
  const lastWord = words.pop() ?? '';
  const rest = words.map(escapeHtml).join(' ');
  return `${rest} <span style="color:${PALETTE.accent}">${escapeHtml(lastWord)}</span>`;
}

// Highlights accentPhrase only when it is a real, findable substring of
// this exact headline — otherwise the whole headline renders plain.
// Never falls back to auto-highlighting a word the copy didn't choose.
function renderHeadlineWithAccentPhrase(headline: string, accentPhrase?: string | null, color = PALETTE.accent): string {
  if (!accentPhrase) {
    return escapeHtml(headline);
  }
  const index = headline.indexOf(accentPhrase);
  if (index === -1) {
    return escapeHtml(headline);
  }
  const before = headline.slice(0, index);
  const after = headline.slice(index + accentPhrase.length);
  return `${escapeHtml(before)}<span style="color:${color}">${escapeHtml(accentPhrase)}</span>${escapeHtml(after)}`;
}

function renderKicker(kicker: string | null | undefined, color: string): string {
  if (!kicker) {
    return '';
  }
  return `<p style="font-family:${SERIF_FONT_STACK};font-style:italic;color:${color};font-size:24px;margin:0 0 12px;opacity:0.85;">${escapeHtml(kicker)}</p>`;
}

function renderSourceLabel(sourceLabel: string | null | undefined, color: string): string {
  if (!sourceLabel) {
    return '';
  }
  return `<p style="font-family:${BODY_FONT_STACK};color:${color};font-size:16px;opacity:0.6;margin-top:24px;">Fonte: ${escapeHtml(sourceLabel)}</p>`;
}

// Numbering ("01/NN"), handle signature and a discreet progress bar —
// the consistent visual signature the brand doc asks for on every slide.
function renderChrome(slide: SlideRenderInput, color: string): string {
  const handle = slide.instagramHandle ?? '@carousel-desk';
  const numbering =
    slide.slideNumber && slide.totalSlides
      ? `<span>${String(slide.slideNumber).padStart(2, '0')}/${String(slide.totalSlides).padStart(2, '0')}</span>`
      : '';
  const progressWidth =
    slide.slideNumber && slide.totalSlides ? Math.round((slide.slideNumber / slide.totalSlides) * 100) : null;
  const progressBar =
    progressWidth === null
      ? ''
      : `<div style="position:absolute;left:64px;right:64px;bottom:24px;height:2px;background:rgba(255,255,255,0.15);"><div style="width:${progressWidth}%;height:100%;background:${color};"></div></div>`;

  return `<div style="position:absolute;top:32px;left:64px;right:64px;display:flex;justify-content:space-between;font-family:${KICKER_FONT_STACK};font-size:16px;letter-spacing:0.05em;color:${color};opacity:0.7;">
    <span>${escapeHtml(handle)}</span>
    ${numbering}
  </div>
  ${progressBar}`;
}

function baseSlideDocument(background: string, innerHtml: string): string {
  return `<!doctype html>
<html>
  <head><style>${loadFontFaceCss()}</style></head>
  <body style="margin:0;width:1080px;height:1350px;position:relative;background:${background};box-sizing:border-box;font-family:${BODY_FONT_STACK};">
    ${innerHtml}
  </body>
</html>`;
}

// --- Legacy template, frozen for already-published posts ---

function renderCoverSlide(slide: SlideRenderInput, imageUrl?: string | null): string {
  const background = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(10,10,10,0) 35%, ${PALETTE.charcoal} 95%);"></div>`
    : '';

  return baseSlideDocument(
    PALETTE.charcoal,
    `${background}
    <div style="position:absolute;left:0;right:0;bottom:0;padding:64px;">
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.cream};font-size:28px;margin:0 0 16px;">${escapeHtml(slide.body)}</p>
      <h1 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:72px;line-height:1.05;margin:0;">${renderHeadlineWithLastWordAccent(slide.headline)}</h1>
    </div>`,
  );
}

// --- New templates ---

function renderCoverCinematicSlide(slide: SlideRenderInput, imageUrl?: string | null): string {
  const background = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(10,10,10,0) 40%, ${PALETTE.charcoal} 96%);"></div>`
    : '';
  const swipeHint =
    slide.totalSlides && slide.totalSlides > 1
      ? `<p style="position:absolute;right:64px;bottom:48px;font-family:${KICKER_FONT_STACK};color:${PALETTE.cream};font-size:18px;opacity:0.7;">arraste →</p>`
      : '';

  return baseSlideDocument(
    PALETTE.charcoal,
    `${background}
    ${renderChrome(slide, PALETTE.cream)}
    <div style="position:absolute;left:0;right:0;bottom:0;padding:64px;">
      ${renderKicker(slide.kicker, PALETTE.cream)}
      <h1 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:72px;line-height:1.05;margin:0 0 16px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h1>
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.cream};font-size:26px;margin:0;opacity:0.9;">${escapeHtml(slide.body)}</p>
    </div>
    ${swipeHint}`,
  );
}

function renderEditorialTextSlide(slide: SlideRenderInput): string {
  return baseSlideDocument(
    PALETTE.cream,
    `${renderChrome(slide, PALETTE.charcoal)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);">
      ${renderKicker(slide.kicker, PALETTE.charcoal)}
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.charcoal};font-size:56px;line-height:1.1;margin:0 0 24px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:32px;line-height:1.4;margin:0;">${escapeHtml(slide.body)}</p>
    </div>`,
  );
}

function renderEvidenceSlide(slide: SlideRenderInput, imageUrl?: string | null): string {
  const supportImage = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="width:100%;height:320px;object-fit:cover;border-radius:12px;margin:24px 0;" />`
    : '';

  return baseSlideDocument(
    PALETTE.cream,
    `${renderChrome(slide, PALETTE.charcoal)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);">
      ${renderKicker(slide.kicker, PALETTE.charcoal)}
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.charcoal};font-size:56px;line-height:1.1;margin:0 0 16px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      ${supportImage}
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:32px;line-height:1.4;margin:0;">${escapeHtml(slide.body)}</p>
      ${renderSourceLabel(slide.sourceLabel, PALETTE.charcoal)}
    </div>`,
  );
}

function renderFrameworkSlide(slide: SlideRenderInput): string {
  const lines = slide.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyHtml =
    lines.length > 1
      ? `<ul style="padding-left:32px;margin:0;">${lines
          .map((line) => `<li style="margin-bottom:16px;">${escapeHtml(line)}</li>`)
          .join('')}</ul>`
      : `<p style="margin:0;">${escapeHtml(slide.body)}</p>`;

  return baseSlideDocument(
    PALETTE.purpleBlack,
    `${renderChrome(slide, PALETTE.cream)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);color:${PALETTE.cream};font-family:${BODY_FONT_STACK};font-size:30px;line-height:1.4;">
      ${renderKicker(slide.kicker, PALETTE.cream)}
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;font-size:56px;line-height:1.1;margin:0 0 32px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase, PALETTE.accent)}</h2>
      ${bodyHtml}
    </div>`,
  );
}

function renderListItemSlide(slide: SlideRenderInput): string {
  const marker = slide.slideNumber ? String(slide.slideNumber).padStart(2, '0') : '•';

  return baseSlideDocument(
    PALETTE.cream,
    `${renderChrome(slide, PALETTE.charcoal)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);">
      <p style="font-family:${HEADLINE_FONT_STACK};font-weight:800;color:${PALETTE.accent};font-size:48px;margin:0 0 16px;">${escapeHtml(marker)}</p>
      ${renderKicker(slide.kicker, PALETTE.charcoal)}
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.charcoal};font-size:48px;line-height:1.1;margin:0 0 20px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:28px;line-height:1.4;margin:0;">${escapeHtml(slide.body)}</p>
    </div>`,
  );
}

// Abstract chat mockup — rounded message bubbles, not a literal
// reproduction of any messaging app's UI/logo (avoids implying a real
// product's screenshot). Body lines become alternating bubbles.
function renderChatDemoSlide(slide: SlideRenderInput): string {
  const lines = slide.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bubbles = lines
    .map((line, index) => {
      const isReply = index % 2 === 1;
      const align = isReply ? 'flex-end' : 'flex-start';
      const bubbleBg = isReply ? PALETTE.accent : '#FFFFFF';
      const textColor = isReply ? PALETTE.cream : PALETTE.charcoal;
      return `<div style="display:flex;justify-content:${align};margin-bottom:16px;">
        <div style="max-width:70%;background:${bubbleBg};color:${textColor};padding:16px 20px;border-radius:20px;font-family:${BODY_FONT_STACK};font-size:24px;line-height:1.35;">${escapeHtml(line)}</div>
      </div>`;
    })
    .join('');

  return baseSlideDocument(
    PALETTE.purpleBlack,
    `${renderChrome(slide, PALETTE.cream)}
    <div style="position:absolute;left:64px;right:64px;top:180px;bottom:120px;display:flex;flex-direction:column;justify-content:center;">
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:40px;line-height:1.1;margin:0 0 32px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      ${bubbles}
    </div>`,
  );
}

function renderCaseStudySlide(slide: SlideRenderInput, imageUrl?: string | null): string {
  const supportImage = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="width:100%;height:280px;object-fit:cover;border-radius:12px;margin:24px 0;" />`
    : '';

  return baseSlideDocument(
    PALETTE.cream,
    `${renderChrome(slide, PALETTE.charcoal)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);border-left:4px solid ${PALETTE.accent};padding-left:32px;">
      ${renderKicker(slide.kicker, PALETTE.charcoal)}
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.charcoal};font-size:48px;line-height:1.1;margin:0 0 16px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      ${supportImage}
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:28px;line-height:1.4;margin:0;">${escapeHtml(slide.body)}</p>
    </div>`,
  );
}

function renderRiskSlide(slide: SlideRenderInput): string {
  return baseSlideDocument(
    PALETTE.charcoal,
    `${renderChrome(slide, PALETTE.cream)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);border:2px solid ${PALETTE.accent};border-radius:16px;padding:40px;">
      <p style="font-family:${KICKER_FONT_STACK};font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${PALETTE.accent};font-size:20px;margin:0 0 16px;">${escapeHtml(slide.kicker ?? 'Risco')}</p>
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:48px;line-height:1.1;margin:0 0 20px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.cream};font-size:28px;line-height:1.4;margin:0;opacity:0.9;">${escapeHtml(slide.body)}</p>
    </div>`,
  );
}

function renderCtaSlide(slide: SlideRenderInput): string {
  return baseSlideDocument(
    PALETTE.charcoal,
    `${renderChrome(slide, PALETTE.cream)}
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);text-align:center;">
      <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:56px;line-height:1.1;margin:0 0 24px;">${renderHeadlineWithAccentPhrase(slide.headline, slide.accentPhrase)}</h2>
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.cream};font-size:28px;line-height:1.4;margin:0 0 32px;opacity:0.9;">${escapeHtml(slide.body)}</p>
      ${
        slide.kicker
          ? `<span style="display:inline-block;background:${PALETTE.accent};color:${PALETTE.cream};font-family:${KICKER_FONT_STACK};font-weight:600;text-transform:uppercase;letter-spacing:0.08em;font-size:24px;padding:16px 32px;border-radius:999px;">${escapeHtml(slide.kicker)}</span>`
          : ''
      }
    </div>`,
  );
}

export function generateSlideHtml(slide: SlideRenderInput, imageUrl?: string | null): string {
  switch (slide.template) {
    case 'cover':
      return renderCoverSlide(slide, imageUrl);
    case 'cover_cinematic':
      return renderCoverCinematicSlide(slide, imageUrl);
    case 'editorial_text':
      return renderEditorialTextSlide(slide);
    case 'evidence':
      return renderEvidenceSlide(slide, imageUrl);
    case 'framework':
      return renderFrameworkSlide(slide);
    case 'list_item':
      return renderListItemSlide(slide);
    case 'chat_demo':
      return renderChatDemoSlide(slide);
    case 'case_study':
      return renderCaseStudySlide(slide, imageUrl);
    case 'risk':
      return renderRiskSlide(slide);
    case 'cta':
      return renderCtaSlide(slide);
    default: {
      const exhaustiveCheck: never = slide.template;
      throw new Error(`generateSlideHtml: unknown template "${String(exhaustiveCheck)}"`);
    }
  }
}
