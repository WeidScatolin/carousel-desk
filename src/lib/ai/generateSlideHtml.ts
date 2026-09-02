import type { SlideCopy } from './writeCopy';

const PALETTE = {
  charcoal: '#0A0A0A',
  cream: '#F2F0E8',
  accent: '#FF3B0A',
  purpleBlack: '#11101D',
} as const;

const HEADLINE_FONT_STACK = "'Arial Narrow', Arial, sans-serif";
const BODY_FONT_STACK = 'Arial, Helvetica, sans-serif';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHeadlineWithAccent(headline: string): string {
  const words = headline.trim().split(/\s+/);
  const lastWord = words.pop() ?? '';
  const rest = words.map(escapeHtml).join(' ');
  return `${rest} <span style="color:${PALETTE.accent}">${escapeHtml(lastWord)}</span>`;
}

function renderCoverSlide(slide: SlideCopy, imageUrl?: string): string {
  const background = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
    <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(10,10,10,0) 35%, ${PALETTE.charcoal} 95%);"></div>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;width:1080px;height:1350px;position:relative;background:${PALETTE.charcoal};box-sizing:border-box;">
    ${background}
    <div style="position:absolute;left:0;right:0;bottom:0;padding:64px;">
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.cream};font-size:28px;margin:0 0 16px;">${escapeHtml(slide.body)}</p>
      <h1 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:72px;line-height:1.05;margin:0;">${renderHeadlineWithAccent(slide.headline)}</h1>
    </div>
  </body>
</html>`;
}

function renderEvidenceSlide(slide: SlideCopy, imageUrl?: string): string {
  const supportImage = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" style="width:100%;height:320px;object-fit:cover;border-radius:12px;margin:0 0 32px;" />`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;width:1080px;height:1350px;background:${PALETTE.cream};box-sizing:border-box;padding:64px;display:flex;flex-direction:column;justify-content:center;">
    <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.charcoal};font-size:56px;line-height:1.1;margin:0 0 32px;">${renderHeadlineWithAccent(slide.headline)}</h2>
    ${supportImage}
    <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:32px;line-height:1.4;margin:0;">${escapeHtml(slide.body)}</p>
    <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:18px;opacity:0.6;margin-top:auto;">@carousel-desk</p>
  </body>
</html>`;
}

function renderFrameworkSlide(slide: SlideCopy): string {
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

  return `<!doctype html>
<html>
  <body style="margin:0;width:1080px;height:1350px;background:${PALETTE.purpleBlack};color:${PALETTE.cream};box-sizing:border-box;padding:64px;display:flex;flex-direction:column;justify-content:center;font-family:${BODY_FONT_STACK};font-size:30px;line-height:1.4;">
    <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;font-size:56px;line-height:1.1;margin:0 0 32px;">${renderHeadlineWithAccent(slide.headline)}</h2>
    ${bodyHtml}
  </body>
</html>`;
}

export function generateSlideHtml(slide: SlideCopy, imageUrl?: string): string {
  switch (slide.template) {
    case 'cover':
      return renderCoverSlide(slide, imageUrl);
    case 'evidence':
      return renderEvidenceSlide(slide, imageUrl);
    case 'framework':
      return renderFrameworkSlide(slide);
    default: {
      const exhaustiveCheck: never = slide.template;
      throw new Error(`generateSlideHtml: unknown template "${String(exhaustiveCheck)}"`);
    }
  }
}
