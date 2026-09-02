import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./pexelsClient', () => ({ searchPexelsImage: vi.fn() }));

import { searchPexelsImage } from './pexelsClient';
import { resolveThemeImage } from './resolveThemeImage';

describe('resolveThemeImage', () => {
  beforeEach(() => {
    vi.mocked(searchPexelsImage).mockReset();
  });

  test('prefers the scraped reference image when one is available', async () => {
    // Arrange / Act
    const result = await resolveThemeImage({
      headlineSuggestion: 'IA muda o mercado de chips',
      referenceImageUrls: ['https://example.com/chip.jpg', 'https://example.com/chip2.jpg'],
    });

    // Assert
    expect(result).toEqual({
      url: 'https://example.com/chip.jpg',
      source: 'scraped',
      sourceImageUrl: 'https://example.com/chip.jpg',
    });
    expect(searchPexelsImage).not.toHaveBeenCalled();
  });

  test('falls back to a Pexels stock photo when there is no scraped image', async () => {
    // Arrange
    vi.mocked(searchPexelsImage).mockResolvedValue('https://images.pexels.com/photos/1/photo.jpeg');

    // Act
    const result = await resolveThemeImage({
      headlineSuggestion: 'IA muda o mercado de chips',
      referenceImageUrls: [],
    });

    // Assert
    expect(result).toEqual({
      url: 'https://images.pexels.com/photos/1/photo.jpeg',
      source: 'stock',
      sourceImageUrl: 'https://images.pexels.com/photos/1/photo.jpeg',
    });
    expect(searchPexelsImage).toHaveBeenCalledWith('IA muda o mercado de chips');
  });

  test('returns null when neither a scraped image nor a stock photo is found', async () => {
    // Arrange
    vi.mocked(searchPexelsImage).mockResolvedValue(null);

    // Act
    const result = await resolveThemeImage({
      headlineSuggestion: 'Tema muito específico sem imagem',
      referenceImageUrls: [],
    });

    // Assert
    expect(result).toBeNull();
  });

  test('returns null instead of throwing when the Pexels lookup fails', async () => {
    // Arrange
    vi.mocked(searchPexelsImage).mockRejectedValue(new Error('PEXELS_API_KEY is not set'));

    // Act
    const result = await resolveThemeImage({
      headlineSuggestion: 'Tema sem imagem raspada',
      referenceImageUrls: [],
    });

    // Assert
    expect(result).toBeNull();
  });
});
