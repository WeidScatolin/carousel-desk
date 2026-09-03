import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface FontFaceSpec {
  family: string;
  weight: number;
  packageDir: string;
  fileName: string;
}

// Self-hosted, versioned packages (not a remote font request) — the
// render step must never depend on network access during a Vercel
// Function's execution. Weights chosen to match docs/brand/DESIGN.md:
// Barlow Condensed ExtraBold for headlines, Inter for body copy,
// Instrument Serif for the small editorial accents (kicker text).
const FONT_FACES: readonly FontFaceSpec[] = [
  {
    family: 'Barlow Condensed',
    weight: 800,
    packageDir: '@fontsource/barlow-condensed/files',
    fileName: 'barlow-condensed-latin-800-normal.woff2',
  },
  {
    family: 'Inter',
    weight: 400,
    packageDir: '@fontsource/inter/files',
    fileName: 'inter-latin-400-normal.woff2',
  },
  {
    family: 'Inter',
    weight: 600,
    packageDir: '@fontsource/inter/files',
    fileName: 'inter-latin-600-normal.woff2',
  },
  {
    family: 'Instrument Serif',
    weight: 400,
    packageDir: '@fontsource/instrument-serif/files',
    fileName: 'instrument-serif-latin-400-normal.woff2',
  },
];

let cached: string | null = null;

function resolveFontFile(spec: FontFaceSpec): string {
  return join(process.cwd(), 'node_modules', spec.packageDir, spec.fileName);
}

// Fonts are embedded as base64 data URIs directly in the slide HTML —
// Playwright's page.setContent() has no reliable base URL for a
// relative file:// reference once bundled into a serverless function,
// so a <link> or @font-face url() pointing at a local path would
// silently fail there even though it works locally.
export function loadFontFaceCss(): string {
  if (cached) {
    return cached;
  }

  cached = FONT_FACES.map((spec) => {
    const base64 = readFileSync(resolveFontFile(spec)).toString('base64');
    return `@font-face{font-family:'${spec.family}';font-weight:${spec.weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${base64}) format('woff2');}`;
  }).join('\n');

  return cached;
}
