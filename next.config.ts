import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/playwright-core/**', './node_modules/@sparticuz/chromium/**',
      './node_modules/@fontsource/*/files/*.woff2', './docs/brand/DESIGN.md',
    ],
  },
};

export default nextConfig;
