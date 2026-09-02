# Scraping de Temas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descobrir diariamente notícias recentes de tecnologia, transformá-las em sugestões editoriais validadas e persistir temas pendentes sem duplicar a URL de origem.

**Architecture:** Um módulo TypeScript busca e normaliza notícias direto no processo do Next.js (fetch + cheerio, sem subprocesso e sem runtime separado). A rota de API valida a fronteira, aplica seleção e reescrita por um provedor de IA configurável e persiste os temas, acionada diariamente pelo GitHub Actions.

**Tech Stack:** Next.js 16 App Router, TypeScript, cheerio, Zod, Vitest, Prisma 7, PostgreSQL/Neon, GitHub Actions. Hospedagem em Vercel (Fluid Compute) — sem Docker, sem runtime Python.

**Spec:** `docs/superpowers/specs/2026-09-02-carousel-desk-design.md`

## Global Constraints

- Hospedagem 100% free tier: Vercel + Neon + GitHub Actions; sem VPS, sem Docker, sem runtime separado para scraping.
- O scraper roda in-process (mesma função Next.js), sem subprocesso e sem contrato de stdout — a validação acontece direto nos tipos de retorno do parser.
- Fontes ficam configuráveis pela constante `SOURCES` no topo de `src/lib/scraping/scrapeThemes.ts`; o plano começa com TechCrunch, The Verge e Ars Technica.
- Cada candidato contém exatamente `sourceUrl`, `headline`, `summary` e `referenceImageUrls`; imagens são opcionais e limitadas a duas URLs absolutas por notícia.
- Testes de scraping não acessam a rede: usam HTML de fixture embutido no teste e injeção da função de fetch.
- Provedor de IA por tarefa vem de `resolveProvider('THEME_SUGGESTION')` ou `resolveProvider('IMAGE_ANALYSIS')`; valores aceitos continuam sendo `"nvidia"` e `"claude"`.
- `completeWithNvidia(prompt: string, model?: string): Promise<string>`, `completeWithClaude(prompt: string, model?: string): Promise<string>` e `loadDesignSystem(): string` são importados da fundação e não reimplementados.
- A rota exige `Authorization: Bearer <DISCOVERY_API_TOKEN>` e falha fechada quando o segredo não está configurado ou não coincide.
- `Theme.sourceUrl` deve ser `@unique`; deduplicação é garantida pelo banco e por `prisma.theme.upsert`.
- Novos temas são gravados com `ThemeStatus.pending`; uma nova descoberta da mesma URL atualiza texto, mas não sobrescreve o status já decidido.
- Sem fila e sem retry automático; erros do scraper, da IA ou do banco produzem resposta HTTP 500 e o próximo cron tenta novamente.
- TypeScript sem `any`, parâmetros e retornos exportados explícitos, imutabilidade, funções menores que 50 linhas e sem `console.log`.
- Testes seguem Arrange-Act-Assert; cobertura mínima de 80% para lógica de pipeline e rota.

---

### Task 1: Scraper de temas em TypeScript (fetch + cheerio)

**Files:**
- Modify: `package.json` (adicionar `cheerio`)
- Create: `src/lib/scraping/scrapeThemes.ts`
- Test: `src/lib/scraping/scrapeThemes.test.ts`

**Interfaces:**
- Consumes: `fetch` global do Node 22; pacote `cheerio`
- Produces: `interface SourceConfig { url: string; articleSelector: string; linkSelector: string; headlineSelector: string; summarySelector: string; imageSelector: string }`; `interface ScrapedCandidate { sourceUrl: string; headline: string; summary: string; referenceImageUrls: string[] }`; `function normalizeUrl(baseUrl: string, value: string): string`; `function parseSource(html: string, source: SourceConfig): ScrapedCandidate[]`; `function scrapeThemes(fetchHtml?: (url: string) => Promise<string>): Promise<ScrapedCandidate[]>`

- [ ] **Step 1: Adicionar a dependência**

Em `package.json`, adicionar em `dependencies`:

```json
"cheerio": "^1.0.0"
```

Run: `npm install`

- [ ] **Step 2: Escrever o teste que falha**

`src/lib/scraping/scrapeThemes.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { normalizeUrl, parseSource, scrapeThemes, type SourceConfig } from './scrapeThemes';

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <body>
    <article class="story">
      <a class="story-link" href="/ai/new-model"><h2>New AI model ships</h2></a>
      <p class="dek">The release lowers inference costs for small teams.</p>
      <img class="hero" src="/images/model.jpg" />
      <img class="secondary" data-src="https://cdn.example.com/chart.png" />
      <img class="ignored" src="/images/third.jpg" />
    </article>
    <article class="story">
      <a class="story-link" href="https://news.example.com/security/passkeys"><h2>Passkeys reach more users</h2></a>
      <p class="dek">A platform update expands passwordless sign-in.</p>
    </article>
    <article class="story">
      <a class="story-link" href=""><h2>Broken item</h2></a>
    </article>
  </body>
</html>`;

const SOURCE: SourceConfig = {
  url: 'https://news.example.com/latest',
  articleSelector: 'article.story',
  linkSelector: 'a.story-link',
  headlineSelector: 'h2',
  summarySelector: 'p.dek',
  imageSelector: 'img',
};

describe('parseSource', () => {
  test('extracts normalized candidates and at most two images each', () => {
    // Arrange / Act
    const candidates = parseSource(FIXTURE_HTML, SOURCE);

    // Assert
    expect(candidates).toEqual([
      {
        sourceUrl: 'https://news.example.com/ai/new-model',
        headline: 'New AI model ships',
        summary: 'The release lowers inference costs for small teams.',
        referenceImageUrls: [
          'https://news.example.com/images/model.jpg',
          'https://cdn.example.com/chart.png',
        ],
      },
      {
        sourceUrl: 'https://news.example.com/security/passkeys',
        headline: 'Passkeys reach more users',
        summary: 'A platform update expands passwordless sign-in.',
        referenceImageUrls: [],
      },
    ]);
  });
});

describe('normalizeUrl', () => {
  test('rejects non-http protocols', () => {
    // Arrange / Act / Assert
    expect(normalizeUrl('https://news.example.com', 'javascript:alert(1)')).toBe('');
    expect(normalizeUrl('https://news.example.com', 'data:image/png;base64,abc')).toBe('');
  });

  test('rejects an empty value instead of resolving to the base URL', () => {
    // Arrange / Act / Assert
    expect(normalizeUrl('https://news.example.com/latest', '')).toBe('');
  });
});

describe('scrapeThemes', () => {
  test('deduplicates candidates across sources by sourceUrl', async () => {
    // Arrange
    const fetchHtml = async (_url: string): Promise<string> => FIXTURE_HTML;

    // Act
    const candidates = await scrapeThemes(fetchHtml, [SOURCE, SOURCE]);

    // Assert
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.sourceUrl).toBe('https://news.example.com/ai/new-model');
  });
});
```

- [ ] **Step 3: Rodar o teste, confirmar que falha**

Run: `npm test -- scrapeThemes.test.ts`

Expected: FAIL com `Cannot find module './scrapeThemes'`.

- [ ] **Step 4: Implementar**

`src/lib/scraping/scrapeThemes.ts`:

```ts
import * as cheerio from 'cheerio';

export interface SourceConfig {
  url: string;
  articleSelector: string;
  linkSelector: string;
  headlineSelector: string;
  summarySelector: string;
  imageSelector: string;
}

export interface ScrapedCandidate {
  sourceUrl: string;
  headline: string;
  summary: string;
  referenceImageUrls: string[];
}

const MAX_REFERENCE_IMAGES = 2;

export const SOURCES: readonly SourceConfig[] = [
  {
    url: 'https://techcrunch.com/latest/',
    articleSelector: 'article',
    linkSelector: 'a',
    headlineSelector: 'h2, h3',
    summarySelector: 'p',
    imageSelector: 'img',
  },
  {
    url: 'https://www.theverge.com/tech',
    articleSelector: 'article',
    linkSelector: 'a',
    headlineSelector: 'h2, h3',
    summarySelector: 'p',
    imageSelector: 'img',
  },
  {
    url: 'https://arstechnica.com/gadgets/',
    articleSelector: 'article',
    linkSelector: 'a',
    headlineSelector: 'h2, h3',
    summarySelector: 'p',
    imageSelector: 'img',
  },
];

export function normalizeUrl(baseUrl: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const candidate = new URL(trimmed, baseUrl);
    return candidate.protocol === 'http:' || candidate.protocol === 'https:'
      ? candidate.toString()
      : '';
  } catch {
    return '';
  }
}

function firstText(article: cheerio.Cheerio<import('domhandler').Element>, selector: string): string {
  return article.find(selector).first().text().trim().replace(/\s+/g, ' ');
}

function imageUrls(
  $: cheerio.CheerioAPI,
  article: cheerio.Cheerio<import('domhandler').Element>,
  sourceUrl: string,
  selector: string,
): string[] {
  const normalized = article
    .find(selector)
    .toArray()
    .map((element) => $(element).attr('src') ?? $(element).attr('data-src') ?? '')
    .map((raw) => normalizeUrl(sourceUrl, raw))
    .filter((url) => url.length > 0);

  return Array.from(new Set(normalized)).slice(0, MAX_REFERENCE_IMAGES);
}

export function parseSource(html: string, source: SourceConfig): ScrapedCandidate[] {
  const $ = cheerio.load(html);

  return $(source.articleSelector)
    .toArray()
    .map((element) => {
      const article = $(element);
      const href = article.find(source.linkSelector).first().attr('href') ?? '';
      return {
        sourceUrl: normalizeUrl(source.url, href),
        headline: firstText(article, source.headlineSelector),
        summary: firstText(article, source.summarySelector),
        referenceImageUrls: imageUrls($, article, source.url, source.imageSelector),
      };
    })
    .filter((candidate) => candidate.sourceUrl.length > 0 && candidate.headline.length > 0);
}

async function defaultFetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`scrapeThemes: request to ${url} failed with status ${response.status}`);
  }
  return response.text();
}

export async function scrapeThemes(
  fetchHtml: (url: string) => Promise<string> = defaultFetchHtml,
  sources: readonly SourceConfig[] = SOURCES,
): Promise<ScrapedCandidate[]> {
  const bySourceUrl = new Map<string, ScrapedCandidate>();

  for (const source of sources) {
    const html = await fetchHtml(source.url);
    for (const candidate of parseSource(html, source)) {
      bySourceUrl.set(candidate.sourceUrl, candidate);
    }
  }

  return Array.from(bySourceUrl.values());
}
```

- [ ] **Step 5: Rodar o teste, confirmar que passa**

Run: `npm test -- scrapeThemes.test.ts`

Expected: PASS (4 testes), sem acesso à rede.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/scraping/scrapeThemes.ts src/lib/scraping/scrapeThemes.test.ts
git commit -m "feat: add TypeScript theme scraper (fetch + cheerio)"
```

---

### Task 2: Seleção e reescrita editorial de temas

**Files:**
- Create: `src/lib/ai/suggestThemes.ts`
- Test: `src/lib/ai/suggestThemes.test.ts`

**Interfaces:**
- Consumes: `ScrapedCandidate` (Task 1); `resolveProvider('THEME_SUGGESTION')`; `completeWithNvidia(prompt: string, model?: string): Promise<string>`; `completeWithClaude(prompt: string, model?: string): Promise<string>`; `loadDesignSystem(): string`
- Produces: `interface ThemeSuggestion { sourceUrl: string; headlineSuggestion: string; summary: string }`; `suggestThemes(candidates: ScrapedCandidate[]): Promise<ThemeSuggestion[]>`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/ai/suggestThemes.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));
vi.mock('./designSystem', () => ({ loadDesignSystem: () => 'EDITORIAL SYSTEM' }));

import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';
import { suggestThemes } from './suggestThemes';

const candidates = Array.from({ length: 5 }, (_, index) => ({
  sourceUrl: `https://example.com/${index}`,
  headline: `Headline ${index}`,
  summary: `Summary ${index}`,
  referenceImageUrls: [],
}));

describe('suggestThemes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('uses NVIDIA and returns three to five validated suggestions', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(candidates.slice(0, 3).map(
      (candidate) => ({
        sourceUrl: candidate.sourceUrl,
        headlineSuggestion: `Editorial ${candidate.headline}`,
        summary: candidate.summary,
      }),
    )));

    // Act
    const result = await suggestThemes(candidates);

    // Assert
    expect(result).toHaveLength(3);
    expect(result[0]?.headlineSuggestion).toBe('Editorial Headline 0');
    expect(completeWithNvidia).toHaveBeenCalledWith(expect.stringContaining('EDITORIAL SYSTEM'));
    expect(completeWithClaude).not.toHaveBeenCalled();
  });

  test('uses Claude when configured', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(candidates.slice(0, 3).map(
      (candidate) => ({
        sourceUrl: candidate.sourceUrl,
        headlineSuggestion: candidate.headline,
        summary: candidate.summary,
      }),
    )));

    // Act
    await suggestThemes(candidates);

    // Assert
    expect(completeWithClaude).toHaveBeenCalledTimes(1);
    expect(completeWithNvidia).not.toHaveBeenCalled();
  });

  test('rejects invalid JSON from the provider', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue('not-json');

    // Act / Assert
    await expect(suggestThemes(candidates)).rejects.toThrow(
      'suggestThemes: provider response was not valid JSON',
    );
  });

  test('rejects suggestions whose URL was not scraped', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'claude');
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify(Array.from(
      { length: 3 },
      (_, index) => ({
        sourceUrl: `https://invented.example/${index}`,
        headlineSuggestion: `Invented ${index}`,
        summary: 'Invented',
      }),
    )));

    // Act / Assert
    await expect(suggestThemes(candidates)).rejects.toThrow(
      'suggestThemes: suggestion sourceUrl was not present in candidates',
    );
  });

  test('rejects duplicate source URLs in provider suggestions', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_THEME_SUGGESTION', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue(JSON.stringify(Array.from(
      { length: 3 },
      (_, index) => ({
        sourceUrl: candidates[0]?.sourceUrl,
        headlineSuggestion: `Version ${index}`,
        summary: 'Repeated source',
      }),
    )));

    // Act / Assert
    await expect(suggestThemes(candidates)).rejects.toThrow(
      'suggestThemes: sourceUrl values must be unique',
    );
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- suggestThemes.test.ts`

Expected: FAIL com `Cannot find module './suggestThemes'`.

- [ ] **Step 3: Implementar**

`src/lib/ai/suggestThemes.ts`:

```ts
import { z } from 'zod';
import type { ScrapedCandidate } from '@/lib/scraping/scrapeThemes';
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
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npm test -- suggestThemes.test.ts`

Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/suggestThemes.ts src/lib/ai/suggestThemes.test.ts
git commit -m "feat: add editorial theme suggestions"
```

---

### Task 3: Análise tolerante a falha de imagem de referência

**Files:**
- Create: `src/lib/ai/analyzeReferenceImage.ts`
- Test: `src/lib/ai/analyzeReferenceImage.test.ts`

**Interfaces:**
- Consumes: `resolveProvider('IMAGE_ANALYSIS')`; `completeWithNvidia(prompt: string, model?: string): Promise<string>`; `completeWithClaude(prompt: string, model?: string): Promise<string>`
- Produces: `analyzeReferenceImage(imageUrl: string): Promise<string | null>`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/ai/analyzeReferenceImage.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));

import { analyzeReferenceImage } from './analyzeReferenceImage';
import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';

describe('analyzeReferenceImage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('returns the short visual description from the selected model', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_IMAGE_ANALYSIS', 'nvidia');
    vi.mocked(completeWithNvidia).mockResolvedValue('Foto escura, alto contraste, foco no chip.');

    // Act
    const result = await analyzeReferenceImage('https://example.com/chip.jpg');

    // Assert
    expect(result).toBe('Foto escura, alto contraste, foco no chip.');
    expect(completeWithNvidia).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/chip.jpg'),
      'meta/llama-3.2-90b-vision-instruct',
    );
  });

  test('returns null when the provider call fails', async () => {
    // Arrange
    vi.stubEnv('PROVIDER_IMAGE_ANALYSIS', 'claude');
    vi.mocked(completeWithClaude).mockRejectedValue(new Error('vision unavailable'));

    // Act
    const result = await analyzeReferenceImage('https://example.com/chip.jpg');

    // Assert
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- analyzeReferenceImage.test.ts`

Expected: FAIL com `Cannot find module './analyzeReferenceImage'`.

- [ ] **Step 3: Implementar**

`src/lib/ai/analyzeReferenceImage.ts`:

```ts
import { completeWithClaude } from './claudeClient';
import { completeWithNvidia } from './nvidiaClient';
import { resolveProvider } from './types';

const NVIDIA_VISION_MODEL = 'meta/llama-3.2-90b-vision-instruct';
const CLAUDE_VISION_MODEL = 'claude-3-5-sonnet-20241022';

function buildPrompt(imageUrl: string): string {
  return [
    `Imagem de referência: ${imageUrl}`,
    'Analise a imagem fornecida ao modelo multimodal e descreva em até 40 palavras',
    'composição, iluminação, cores, enquadramento e assunto visual.',
    'Não faça afirmações sobre autoria ou licença.',
  ].join('\n');
}

export async function analyzeReferenceImage(imageUrl: string): Promise<string | null> {
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const provider = resolveProvider('IMAGE_ANALYSIS');
    const prompt = buildPrompt(imageUrl);
    const result = provider === 'nvidia'
      ? await completeWithNvidia(prompt, NVIDIA_VISION_MODEL)
      : await completeWithClaude(prompt, CLAUDE_VISION_MODEL);
    const description = result.trim();
    return description || null;
  } catch {
    return null;
  }
}
```

Nota de contrato: esta implementação preserva obrigatoriamente as assinaturas textuais dos clientes da fundação. A URL da imagem segue no prompt destinado ao modelo de visão explícito; nenhum cliente de provedor é duplicado ou alterado neste plano.

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npm test -- analyzeReferenceImage.test.ts`

Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/analyzeReferenceImage.ts src/lib/ai/analyzeReferenceImage.test.ts
git commit -m "feat: add resilient reference image analysis"
```

---

### Task 4: Unicidade de URL e rota autenticada de descoberta

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260902090000_unique_theme_source_url/migration.sql`
- Create: `src/app/api/pipeline/discover/route.ts`
- Test: `src/app/api/pipeline/discover/route.test.ts`

**Interfaces:**
- Consumes: `scrapeThemes(): Promise<ScrapedCandidate[]>`; `suggestThemes(candidates: ScrapedCandidate[]): Promise<ThemeSuggestion[]>`; `prisma.theme.upsert`; `DISCOVERY_API_TOKEN`
- Produces: `POST(request: Request): Promise<Response>`; índice único `Theme_sourceUrl_key`

- [ ] **Step 1: Escrever o teste que falha**

`src/app/api/pipeline/discover/route.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/scraping/scrapeThemes', () => ({ scrapeThemes: vi.fn() }));
vi.mock('@/lib/ai/suggestThemes', () => ({ suggestThemes: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { theme: { upsert: vi.fn() } } }));

import { suggestThemes } from '@/lib/ai/suggestThemes';
import { prisma } from '@/lib/prisma';
import { scrapeThemes } from '@/lib/scraping/scrapeThemes';
import { POST } from './route';

function request(token = 'test-token'): Request {
  return new Request('http://localhost/api/pipeline/discover', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('POST /api/pipeline/discover', () => {
  beforeEach(() => {
    vi.stubEnv('DISCOVERY_API_TOKEN', 'test-token');
    vi.mocked(scrapeThemes).mockReset();
    vi.mocked(suggestThemes).mockReset();
    vi.mocked(prisma.theme.upsert).mockReset();
  });

  test('returns 401 without the configured bearer token', async () => {
    // Arrange / Act
    const response = await POST(request('wrong-token'));

    // Assert
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(scrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 401 when the authorization header is absent', async () => {
    // Arrange
    const unauthorized = new Request('http://localhost/api/pipeline/discover', {
      method: 'POST',
    });

    // Act
    const response = await POST(unauthorized);

    // Assert
    expect(response.status).toBe(401);
    expect(scrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 401 when the server token is not configured', async () => {
    // Arrange
    vi.stubEnv('DISCOVERY_API_TOKEN', '');

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(401);
    expect(scrapeThemes).not.toHaveBeenCalled();
  });

  test('scrapes, suggests and upserts pending themes without resetting status', async () => {
    // Arrange
    const candidates = [{
      sourceUrl: 'https://example.com/news',
      headline: 'Raw headline',
      summary: 'Raw summary',
      referenceImageUrls: [],
    }];
    const suggestions = [{
      sourceUrl: 'https://example.com/news',
      headlineSuggestion: 'Editorial headline',
      summary: 'Editorial summary',
    }];
    vi.mocked(scrapeThemes).mockResolvedValue(candidates);
    vi.mocked(suggestThemes).mockResolvedValue(suggestions);
    vi.mocked(prisma.theme.upsert).mockResolvedValue({ id: 'theme-1' } as never);

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { discovered: 1 } });
    expect(prisma.theme.upsert).toHaveBeenCalledWith({
      where: { sourceUrl: 'https://example.com/news' },
      create: {
        sourceUrl: 'https://example.com/news',
        headlineSuggestion: 'Editorial headline',
        summary: 'Editorial summary',
        status: 'pending',
      },
      update: {
        headlineSuggestion: 'Editorial headline',
        summary: 'Editorial summary',
      },
    });
  });

  test('returns 500 when discovery fails', async () => {
    // Arrange
    vi.mocked(scrapeThemes).mockRejectedValue(new Error('scraper unavailable'));

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Theme discovery failed',
    });
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- src/app/api/pipeline/discover/route.test.ts`

Expected: FAIL com `Cannot find module './route'`.

- [ ] **Step 3: Implementar**

Em `prisma/schema.prisma`, alterar somente o campo do model `Theme`:

```prisma
sourceUrl String @unique
```

`prisma/migrations/20260902090000_unique_theme_source_url/migration.sql`:

```sql
WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "sourceUrl"
      ORDER BY "createdAt", "id"
    ) AS keeper_id
  FROM "Theme"
), duplicates AS (
  SELECT "id", keeper_id FROM ranked WHERE "id" <> keeper_id
)
UPDATE "Post"
SET "themeId" = duplicates.keeper_id
FROM duplicates
WHERE "Post"."themeId" = duplicates."id";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "sourceUrl"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Theme"
)
DELETE FROM "Theme"
USING ranked
WHERE "Theme"."id" = ranked."id"
  AND ranked.position > 1;

CREATE UNIQUE INDEX "Theme_sourceUrl_key" ON "Theme"("sourceUrl");
```

A migration remapeia eventuais `Post.themeId` ao tema mais antigo de cada URL antes de apagar duplicatas, preservando relações existentes e permitindo criar o índice único com segurança.

`src/app/api/pipeline/discover/route.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npx prisma generate && npm test -- src/app/api/pipeline/discover/route.test.ts`

Expected: PASS (5 testes). Depois, com `DATABASE_URL` de desenvolvimento configurada, run: `npx prisma migrate dev`; expected: migration aplicada e client gerado com `ThemeWhereUniqueInput.sourceUrl`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260902090000_unique_theme_source_url/migration.sql src/app/api/pipeline/discover/route.ts src/app/api/pipeline/discover/route.test.ts
git commit -m "feat: add authenticated theme discovery endpoint"
```

---

### Task 5: Agendamento diário via GitHub Actions

**Files:**
- Create: `.github/workflows/discover-themes.yml`

**Interfaces:**
- Consumes: secrets `DISCOVERY_API_TOKEN` e `APP_URL`; rota `POST /api/pipeline/discover` (hospedada no Vercel)
- Produces: workflow diário `discover-themes`

- [ ] **Step 1: Escrever a configuração inicial que ainda não foi validada**

`.github/workflows/discover-themes.yml`:

```yaml
name: Discover themes

on:
  schedule:
    - cron: '17 09 * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  discover:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Trigger theme discovery
        env:
          APP_URL: ${{ secrets.APP_URL }}
          DISCOVERY_API_TOKEN: ${{ secrets.DISCOVERY_API_TOKEN }}
        run: |
          set -euo pipefail
          curl --fail-with-body --silent --show-error \
            --request POST \
            --header "Authorization: Bearer ${DISCOVERY_API_TOKEN}" \
            "${APP_URL%/}/api/pipeline/discover"
```

`APP_URL` aponta para o domínio do deploy de produção no Vercel (ex.: `https://carousel-desk.vercel.app`); não há imagem ou runtime adicional a publicar — o deploy do app é feito pelo próprio Vercel a partir do repositório Git.

- [ ] **Step 2: Rodar as validações e observar qualquer falha real**

Run: `npx prettier --check .github/workflows/discover-themes.yml && npm test && npm run build`

Expected: antes de corrigir qualquer erro de sintaxe ou falha de teste/build revelado pelo ambiente, o comando correspondente falha com mensagem específica; não avançar enquanto houver falha.

- [ ] **Step 3: Implementar os ajustes exigidos pela validação**

Manter como conteúdo final o arquivo completo do Step 1. Não inserir valores de secrets no YAML.

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npx prettier --check .github/workflows/discover-themes.yml && npm test && npm run build`

Expected: Prettier encerra com código 0; toda a suíte de testes passa; o build Next.js conclui.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/discover-themes.yml
git commit -m "ci: schedule theme discovery"
```

## Autorrevisão final

- [ ] Confirmar que o scraper cobre três fontes configuráveis, título, resumo, URL e no máximo duas imagens, e que os testes usam somente HTML de fixture embutido, sem acesso à rede.
- [ ] Confirmar que `scrapeThemes` deduplica candidatos por `sourceUrl` entre fontes.
- [ ] Confirmar que `suggestThemes` usa o sistema de marca, escolhe entre três e cinco itens e impede URLs inventadas.
- [ ] Confirmar que `analyzeReferenceImage` seleciona o provedor de visão e converte qualquer falha em `null`.
- [ ] Confirmar que a migration cria unicidade em `Theme.sourceUrl` e que o upsert não redefine status de temas existentes.
- [ ] Confirmar autenticação fail-closed, comparação em tempo constante e ausência de secrets hardcoded.
- [ ] Confirmar workflow diário, `workflow_dispatch`, permissões mínimas, timeout e `curl --fail-with-body`.
- [ ] Confirmar que nenhum arquivo do plano referencia Python, Scrapling ou Docker.
- [ ] Fazer um scan por marcadores de pendência, frases que deleguem implementação e trechos elididos; expected: nenhuma ocorrência fora desta instrução de revisão.
- [ ] Rodar `rg -n "\bany\b|console\.log" docs/superpowers/plans/2026-09-02-scraping-temas.md`; expected: nenhuma ocorrência em código TypeScript.
- [ ] Conferir consistência ponta a ponta de `ScrapedCandidate`, `ThemeSuggestion`, `sourceUrl`, `headlineSuggestion`, `summary` e `referenceImageUrls`.
- [ ] Rodar `npm test`, `npm run build` e validar cobertura mínima de 80% antes do merge.
