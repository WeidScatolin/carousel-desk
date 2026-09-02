import { resolveProvider } from './types';
import { completeWithNvidia } from './nvidiaClient';
import { completeWithClaude } from './claudeClient';
import { loadDesignSystem } from './designSystem';

export interface ThemeInput {
  headlineSuggestion: string;
  summary: string;
}

export interface SlideCopy {
  template: 'cover' | 'evidence' | 'framework';
  headline: string;
  body: string;
}

function buildPrompt(theme: ThemeInput): string {
  return [
    loadDesignSystem(),
    '',
    `Tema: ${theme.headlineSuggestion}`,
    `Resumo: ${theme.summary}`,
    '',
    'Escreva a copy de um carrossel de 3 slides seguindo os templates',
    '"cover", "evidence" e "framework" definidos acima. Responda em JSON,',
    'como uma lista de objetos com os campos "template", "headline" e',
    '"body". Não inclua nada além do JSON na resposta.',
  ].join('\n');
}

function parseSlide(item: unknown, index: number): SlideCopy {
  if (
    typeof item !== 'object' ||
    item === null ||
    !('template' in item) ||
    !('headline' in item) ||
    !('body' in item)
  ) {
    throw new Error(`writeCopy: slide at index ${index} is missing required fields`);
  }

  const { template, headline, body } = item as Record<string, unknown>;

  if (template !== 'cover' && template !== 'evidence' && template !== 'framework') {
    throw new Error(`writeCopy: slide at index ${index} has invalid template "${String(template)}"`);
  }

  return { template, headline: String(headline), body: String(body) };
}

export async function writeCopy(theme: ThemeInput): Promise<SlideCopy[]> {
  const provider = resolveProvider('COPYWRITING');
  const prompt = buildPrompt(theme);
  const raw = provider === 'nvidia' ? await completeWithNvidia(prompt) : await completeWithClaude(prompt);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`writeCopy: provider response was not valid JSON: ${raw}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('writeCopy: expected a non-empty array of slide copy');
  }

  return parsed.map(parseSlide);
}
