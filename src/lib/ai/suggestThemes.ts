import { z } from 'zod';
import type { ScrapedCandidate } from '@/lib/scraping/runScrapeThemes';
import { completeWithClaude } from './claudeClient';
import { loadDesignSystem } from './designSystem';
import { completeWithNvidia } from './nvidiaClient';
import { resolveProvider } from './types';

const themeSuggestionSchema = z.object({
  sourceUrl: z.string().url(),
  headlineSuggestion: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

const suggestionsSchema = z.array(themeSuggestionSchema).min(3).max(5);

export interface ThemeSuggestion {
  sourceUrl: string;
  headlineSuggestion: string;
  summary: string;
}

function buildPrompt(candidates: ScrapedCandidate[]): string {
  return [
    loadDesignSystem(),
    '',
    'Selecione de 3 a 5 notícias com maior potencial editorial.',
    'Reescreva headlineSuggestion e summary no tom da marca sem inventar fatos.',
    'Preserve sourceUrl exatamente. Responda somente com um array JSON de objetos',
    'com sourceUrl, headlineSuggestion e summary.',
    JSON.stringify(candidates),
  ].join('\n');
}

function parseSuggestions(raw: string, candidates: ScrapedCandidate[]): ThemeSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`suggestThemes: provider response was not valid JSON: ${raw}`);
  }
  const suggestions = suggestionsSchema.parse(parsed);
  const sourceUrls = new Set(candidates.map(({ sourceUrl }) => sourceUrl));
  if (suggestions.some(({ sourceUrl }) => !sourceUrls.has(sourceUrl))) {
    throw new Error('suggestThemes: suggestion sourceUrl was not present in candidates');
  }
  const selectedUrls = new Set(suggestions.map(({ sourceUrl }) => sourceUrl));
  if (selectedUrls.size !== suggestions.length) {
    throw new Error('suggestThemes: sourceUrl values must be unique');
  }
  return suggestions;
}

export async function suggestThemes(
  candidates: ScrapedCandidate[],
): Promise<ThemeSuggestion[]> {
  if (candidates.length < 3) {
    throw new Error('suggestThemes: at least 3 candidates are required');
  }
  const provider = resolveProvider('THEME_SUGGESTION');
  const prompt = buildPrompt(candidates);
  const raw = provider === 'nvidia'
    ? await completeWithNvidia(prompt)
    : await completeWithClaude(prompt);
  return parseSuggestions(raw, candidates);
}
