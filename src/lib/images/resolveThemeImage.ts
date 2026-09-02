import { searchPexelsImage } from './pexelsClient';

export interface ThemeImageInput {
  headlineSuggestion: string;
  referenceImageUrls: string[];
}

export interface ThemeImage {
  url: string;
  source: 'scraped' | 'stock';
  sourceImageUrl: string;
}

export async function resolveThemeImage(theme: ThemeImageInput): Promise<ThemeImage | null> {
  const scrapedImageUrl = theme.referenceImageUrls[0];
  if (scrapedImageUrl) {
    return { url: scrapedImageUrl, source: 'scraped', sourceImageUrl: scrapedImageUrl };
  }

  try {
    const stockImageUrl = await searchPexelsImage(theme.headlineSuggestion);
    return stockImageUrl
      ? { url: stockImageUrl, source: 'stock', sourceImageUrl: stockImageUrl }
      : null;
  } catch {
    return null;
  }
}
