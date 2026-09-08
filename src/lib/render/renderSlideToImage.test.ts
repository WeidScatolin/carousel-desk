import { describe, test, expect } from 'vitest';
import imageSize from 'image-size';
import { renderSlideToImage } from './renderSlideToImage';

describe('renderSlideToImage', () => {
  test('renders HTML into a JPEG at the exact slide dimensions, at 1080 by 1350', async () => {
    const html =
      '<html><body style="margin:0;width:1080px;height:1350px;background:#0A0A0A"></body></html>';

    const buffer = await renderSlideToImage(html);
    const dimensions = imageSize(buffer);

    expect(dimensions.type).toBe('jpg');
    expect(dimensions.width).toBe(1080);
    expect(dimensions.height).toBe(1350);
  }, 30000);
});
