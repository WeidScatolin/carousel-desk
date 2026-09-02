import { describe, test, expect } from 'vitest';
import imageSize from 'image-size';
import { renderSlideToImage } from './renderSlideToImage';

describe('renderSlideToImage', () => {
  test('renders HTML into a PNG at the exact slide dimensions, scaled 2x', async () => {
    const html =
      '<html><body style="margin:0;width:1080px;height:1350px;background:#0A0A0A"></body></html>';

    const buffer = await renderSlideToImage(html);
    const dimensions = imageSize(buffer);

    expect(dimensions.type).toBe('png');
    expect(dimensions.width).toBe(1080 * 2);
    expect(dimensions.height).toBe(1350 * 2);
  }, 30000);
});
