const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

interface PexelsSearchResponse {
  photos: { src: { large: string } }[];
}

function parseResponse(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('photos' in payload)) {
    return null;
  }
  const { photos } = payload as PexelsSearchResponse;
  return Array.isArray(photos) && photos.length > 0 ? photos[0]?.src.large ?? null : null;
}

export async function searchPexelsImage(query: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is not set');
  }

  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`;
  const response = await fetch(url, { headers: { Authorization: apiKey } });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  return parseResponse(payload);
}
