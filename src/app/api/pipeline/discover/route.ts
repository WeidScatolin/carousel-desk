import { timingSafeEqual } from 'node:crypto';
import { suggestThemes } from '@/lib/ai/suggestThemes';
import { prisma } from '@/lib/prisma';
import { scrapeThemes } from '@/lib/scraping/scrapeThemes';

function authorized(request: Request): boolean {
  const expected = process.env.DISCOVERY_API_TOKEN;
  const provided = request.headers.get('authorization');
  if (!expected || !provided?.startsWith('Bearer ')) {
    return false;
  }
  const actual = provided.slice('Bearer '.length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const candidates = await scrapeThemes();
    const suggestions = await suggestThemes(candidates);
    await Promise.all(suggestions.map((suggestion) => prisma.theme.upsert({
      where: { sourceUrl: suggestion.sourceUrl },
      create: { ...suggestion, status: 'pending' },
      update: {
        headlineSuggestion: suggestion.headlineSuggestion,
        summary: suggestion.summary,
        referenceImageUrls: suggestion.referenceImageUrls,
      },
    })));
    return Response.json({ success: true, data: { discovered: suggestions.length } });
  } catch {
    return Response.json(
      { success: false, error: 'Theme discovery failed' },
      { status: 500 },
    );
  }
}
