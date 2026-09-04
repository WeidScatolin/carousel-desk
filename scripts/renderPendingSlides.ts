// Run by .github/workflows/render-slides.yml on a full Ubuntu Actions
// runner (real Chromium, not Vercel's constrained @sparticuz build,
// which has repeatedly failed to reliably screenshot in production).
//
// Fetches slides that have copy but no rendered image
// (GET /api/pipeline/pending-slides), screenshots each one locally with
// Playwright, and reports the result back
// (POST /api/pipeline/slides/:id/render-complete) — that endpoint does
// the actual Cloudinary upload, so credentials for it only ever live in
// Vercel's env, not duplicated into GitHub secrets.
import { renderSlideToImage } from '../src/lib/render/renderSlideToImage';

interface PendingSlide {
  id: string;
  postId: string;
  htmlContent: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`renderPendingSlides: ${name} is not set`);
  }
  return value;
}

async function fetchPendingSlides(appUrl: string, token: string): Promise<PendingSlide[]> {
  const response = await fetch(`${appUrl}/api/pipeline/pending-slides`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`renderPendingSlides: failed to list pending slides (${response.status})`);
  }
  const body = (await response.json()) as { slides: PendingSlide[] };
  return body.slides;
}

async function reportRendered(appUrl: string, token: string, slideId: string, imageBase64: string): Promise<void> {
  const response = await fetch(`${appUrl}/api/pipeline/slides/${slideId}/render-complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });
  if (!response.ok) {
    throw new Error(`renderPendingSlides: failed to report slide ${slideId} as rendered (${response.status})`);
  }
}

async function main(): Promise<void> {
  const appUrl = requireEnv('APP_URL').replace(/\/$/, '');
  const token = requireEnv('PUBLISH_API_TOKEN');

  const slides = await fetchPendingSlides(appUrl, token);
  console.log(`renderPendingSlides: ${slides.length} slide(s) to render`);

  let succeeded = 0;
  let failed = 0;
  for (const slide of slides) {
    try {
      const buffer = await renderSlideToImage(slide.htmlContent);
      await reportRendered(appUrl, token, slide.id, buffer.toString('base64'));
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(`renderPendingSlides: slide ${slide.id} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`renderPendingSlides: done — ${succeeded} succeeded, ${failed} failed`);
  if (failed > 0 && succeeded === 0) {
    process.exitCode = 1;
  }
}

void main();
