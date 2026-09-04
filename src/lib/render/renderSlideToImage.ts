import { chromium, type Browser } from 'playwright';

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;
const DEVICE_SCALE_FACTOR = 2;

async function launchBrowser(): Promise<Browser> {
  if (!process.env.VERCEL) {
    return chromium.launch();
  }

  const sparticuzChromium = (await import('@sparticuz/chromium')).default;
  return chromium.launch({
    executablePath: await sparticuzChromium.executablePath(),
    args: sparticuzChromium.args,
    headless: true,
  });
}

export async function renderSlideToImage(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    await page.setContent(html, { waitUntil: 'networkidle' });
    // Fonts are embedded as base64 data URIs (see loadFonts.ts), so they're
    // already in the DOM after setContent — but the browser still needs a
    // tick to decode and apply them before a screenshot is trustworthy.
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
}
