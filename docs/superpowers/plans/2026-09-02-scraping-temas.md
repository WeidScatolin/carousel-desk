# Scraping de Temas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descobrir diariamente notícias recentes de tecnologia, transformá-las em sugestões editoriais validadas e persistir temas pendentes sem duplicar a URL de origem.

**Architecture:** Um script Python isolado usa Scrapling para buscar e normalizar notícias e emite um único documento JSON pela stdout. O Next.js executa esse processo, valida a fronteira com Zod, aplica seleção e reescrita por um provedor de IA configurável e persiste os temas por uma rota autenticada, acionada diariamente pelo GitHub Actions.

**Tech Stack:** Python 3.10+, Scrapling, pytest, Next.js 16 App Router, TypeScript, Zod, Vitest, Prisma 7, PostgreSQL/Neon, GitHub Actions, Docker multi-stage com Node.js 22 e Python 3.

**Spec:** `docs/superpowers/specs/2026-09-02-carousel-desk-design.md`

## Global Constraints

- Hospedagem 100% free tier: Render + Neon + GitHub Actions; sem VPS e sem serviço separado permanente para Python.
- O script Python é um subprocesso efêmero e deve escrever exatamente um JSON válido na stdout; diagnóstico pertence à stderr.
- Fontes ficam configuráveis pela constante `SOURCES` no topo de `scripts/scrape_themes.py`; o plano começa com TechCrunch, The Verge e Ars Technica.
- Cada candidato contém exatamente `sourceUrl`, `headline`, `summary` e `referenceImageUrls`; imagens são opcionais e limitadas a duas URLs absolutas por notícia.
- Testes de scraping não acessam a rede: usam fixture HTML local e injeção do fetcher.
- Provedor de IA por tarefa vem de `resolveProvider('THEME_SUGGESTION')` ou `resolveProvider('IMAGE_ANALYSIS')`; valores aceitos continuam sendo `"nvidia"` e `"claude"`.
- `completeWithNvidia(prompt: string, model?: string): Promise<string>`, `completeWithClaude(prompt: string, model?: string): Promise<string>` e `loadDesignSystem(): string` são importados da fundação e não reimplementados.
- A rota exige `Authorization: Bearer <DISCOVERY_API_TOKEN>` e falha fechada quando o segredo não está configurado ou não coincide.
- `Theme.sourceUrl` deve ser `@unique`; deduplicação é garantida pelo banco e por `prisma.theme.upsert`.
- Novos temas são gravados com `ThemeStatus.pending`; uma nova descoberta da mesma URL atualiza texto, mas não sobrescreve o status já decidido.
- Sem fila e sem retry automático; erros do subprocesso, da IA ou do banco produzem resposta HTTP 500 e o próximo cron tenta novamente.
- TypeScript sem `any`, parâmetros e retornos exportados explícitos, imutabilidade, funções menores que 50 linhas e sem `console.log`.
- Testes seguem Arrange-Act-Assert; cobertura mínima de 80% para lógica de pipeline e rota.

---

### Task 1: Dependências Python e parser de fixture

**Files:**
- Create: `requirements.txt`
- Create: `tests/python/fixtures/tech_news.html`
- Create: `tests/python/test_scrape_themes.py`
- Create: `scripts/scrape_themes.py`

**Interfaces:**
- Consumes: Python 3.10+; pacote `scrapling[fetchers]>=0.4.8,<0.5`
- Produces: `parse_source(html: str, source: SourceConfig) -> list[dict[str, object]]`; `normalize_url(base_url: str, value: str) -> str`

- [ ] **Step 1: Escrever o teste que falha**

`requirements.txt`:

```text
scrapling[fetchers]>=0.4.8,<0.5
pytest>=8.3,<9
```

`tests/python/fixtures/tech_news.html`:

```html
<!doctype html>
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
</html>
```

`tests/python/test_scrape_themes.py`:

```python
from pathlib import Path

from scripts.scrape_themes import SourceConfig, normalize_url, parse_source


FIXTURE = Path(__file__).parent / "fixtures" / "tech_news.html"
SOURCE = SourceConfig(
    url="https://news.example.com/latest",
    article_selector="article.story",
    link_selector="a.story-link",
    headline_selector="h2",
    summary_selector="p.dek",
    image_selector="img",
)


def test_parse_source_extracts_normalized_candidates_and_two_images() -> None:
    # Arrange
    html = FIXTURE.read_text(encoding="utf-8")

    # Act
    candidates = parse_source(html, SOURCE)

    # Assert
    assert candidates == [
        {
            "sourceUrl": "https://news.example.com/ai/new-model",
            "headline": "New AI model ships",
            "summary": "The release lowers inference costs for small teams.",
            "referenceImageUrls": [
                "https://news.example.com/images/model.jpg",
                "https://cdn.example.com/chart.png",
            ],
        },
        {
            "sourceUrl": "https://news.example.com/security/passkeys",
            "headline": "Passkeys reach more users",
            "summary": "A platform update expands passwordless sign-in.",
            "referenceImageUrls": [],
        },
    ]


def test_normalize_url_rejects_non_http_protocols() -> None:
    # Arrange / Act / Assert
    assert normalize_url("https://news.example.com", "javascript:alert(1)") == ""
    assert normalize_url("https://news.example.com", "data:image/png;base64,abc") == ""
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `python3 -m pip install -r requirements.txt && python3 -m pytest tests/python/test_scrape_themes.py -q`

Expected: FAIL com `ModuleNotFoundError: No module named 'scripts.scrape_themes'`.

- [ ] **Step 3: Implementar**

`scripts/scrape_themes.py` (primeira versão, somente parsing; a Task 2 adicionará fetch e CLI):

```python
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from scrapling.parser import Selector


@dataclass(frozen=True)
class SourceConfig:
    url: str
    article_selector: str
    link_selector: str
    headline_selector: str
    summary_selector: str
    image_selector: str


SOURCES: tuple[SourceConfig, ...] = (
    SourceConfig("https://techcrunch.com/latest/", "article", "a", "h2, h3", "p", "img"),
    SourceConfig("https://www.theverge.com/tech", "article", "a", "h2, h3", "p", "img"),
    SourceConfig("https://arstechnica.com/gadgets/", "article", "a", "h2, h3", "p", "img"),
)


def normalize_url(base_url: str, value: str) -> str:
    candidate = urljoin(base_url, value.strip())
    return candidate if urlparse(candidate).scheme in {"http", "https"} else ""


def first_text(node: Selector, selector: str) -> str:
    match = node.css(selector).first
    return " ".join(match.text.split()) if match is not None else ""


def image_urls(node: Selector, source_url: str, selector: str) -> list[str]:
    values: list[str] = []
    for image in node.css(selector):
        raw = image.attrib.get("src") or image.attrib.get("data-src") or ""
        normalized = normalize_url(source_url, raw)
        if normalized and normalized not in values:
            values = [*values, normalized]
        if len(values) == 2:
            break
    return values


def parse_source(html: str, source: SourceConfig) -> list[dict[str, object]]:
    page = Selector(html)
    candidates: list[dict[str, object]] = []
    for article in page.css(source.article_selector):
        link = article.css(source.link_selector).first
        source_url = normalize_url(source.url, link.attrib.get("href", "") if link else "")
        headline = first_text(article, source.headline_selector)
        if not source_url or not headline:
            continue
        candidates = [*candidates, {
            "sourceUrl": source_url,
            "headline": headline,
            "summary": first_text(article, source.summary_selector),
            "referenceImageUrls": image_urls(article, source.url, source.image_selector),
        }]
    return candidates
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `python3 -m pytest tests/python/test_scrape_themes.py -q`

Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add requirements.txt scripts/scrape_themes.py tests/python/fixtures/tech_news.html tests/python/test_scrape_themes.py
git commit -m "test: add theme scraper parsing contract"
```

---

### Task 2: Execução do scraper e contrato JSON na stdout

**Files:**
- Modify: `scripts/scrape_themes.py`
- Modify: `tests/python/test_scrape_themes.py`

**Interfaces:**
- Consumes: `SOURCES`; `parse_source(html: str, source: SourceConfig) -> list[dict[str, object]]`; `StealthyFetcher.fetch(url: str, headless: bool, network_idle: bool)`
- Produces: `scrape_themes(fetch_html: Callable[[str], str]) -> list[dict[str, object]]`; `main() -> None`; stdout `{"candidates": [...]}`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/python/test_scrape_themes.py`:

```python
import json
import subprocess
import sys
from collections.abc import Callable

import scripts.scrape_themes as scraper


def test_scrape_themes_deduplicates_source_urls(monkeypatch) -> None:
    # Arrange
    html = FIXTURE.read_text(encoding="utf-8")
    monkeypatch.setattr(scraper, "SOURCES", (SOURCE, SOURCE))
    fetch_html: Callable[[str], str] = lambda _url: html

    # Act
    candidates = scraper.scrape_themes(fetch_html)

    # Assert
    assert len(candidates) == 2
    assert candidates[0]["sourceUrl"] == "https://news.example.com/ai/new-model"


def test_cli_prints_one_json_document(monkeypatch, capsys) -> None:
    # Arrange
    expected = [{
        "sourceUrl": "https://news.example.com/item",
        "headline": "Headline",
        "summary": "Summary",
        "referenceImageUrls": [],
    }]
    monkeypatch.setattr(scraper, "scrape_themes", lambda _fetch: expected)

    # Act
    scraper.main()

    # Assert
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"candidates": expected}
    assert captured.err == ""
    assert captured.out.count("\n") == 1
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `python3 -m pytest tests/python/test_scrape_themes.py -q`

Expected: FAIL com `AttributeError: module 'scripts.scrape_themes' has no attribute 'scrape_themes'`.

- [ ] **Step 3: Implementar**

Substituir `scripts/scrape_themes.py` pelo arquivo completo:

```python
import json
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from scrapling.fetchers import StealthyFetcher
from scrapling.parser import Selector


@dataclass(frozen=True)
class SourceConfig:
    url: str
    article_selector: str
    link_selector: str
    headline_selector: str
    summary_selector: str
    image_selector: str


SOURCES: tuple[SourceConfig, ...] = (
    SourceConfig("https://techcrunch.com/latest/", "article", "a", "h2, h3", "p", "img"),
    SourceConfig("https://www.theverge.com/tech", "article", "a", "h2, h3", "p", "img"),
    SourceConfig("https://arstechnica.com/gadgets/", "article", "a", "h2, h3", "p", "img"),
)


def normalize_url(base_url: str, value: str) -> str:
    candidate = urljoin(base_url, value.strip())
    return candidate if urlparse(candidate).scheme in {"http", "https"} else ""


def first_text(node: Selector, selector: str) -> str:
    match = node.css(selector).first
    return " ".join(match.text.split()) if match is not None else ""


def image_urls(node: Selector, source_url: str, selector: str) -> list[str]:
    values: list[str] = []
    for image in node.css(selector):
        raw = image.attrib.get("src") or image.attrib.get("data-src") or ""
        normalized = normalize_url(source_url, raw)
        if normalized and normalized not in values:
            values = [*values, normalized]
        if len(values) == 2:
            break
    return values


def parse_source(html: str, source: SourceConfig) -> list[dict[str, object]]:
    page = Selector(html)
    candidates: list[dict[str, object]] = []
    for article in page.css(source.article_selector):
        link = article.css(source.link_selector).first
        source_url = normalize_url(source.url, link.attrib.get("href", "") if link else "")
        headline = first_text(article, source.headline_selector)
        if not source_url or not headline:
            continue
        candidates = [*candidates, {
            "sourceUrl": source_url,
            "headline": headline,
            "summary": first_text(article, source.summary_selector),
            "referenceImageUrls": image_urls(article, source.url, source.image_selector),
        }]
    return candidates


def fetch_html(url: str) -> str:
    page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    return page.html_content


def scrape_themes(fetch: Callable[[str], str]) -> list[dict[str, object]]:
    by_url: dict[str, dict[str, object]] = {}
    for source in SOURCES:
        for candidate in parse_source(fetch(source.url), source):
            by_url = {**by_url, str(candidate["sourceUrl"]): candidate}
    return list(by_url.values())


def main() -> None:
    payload = {"candidates": scrape_themes(fetch_html)}
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `python3 -m pytest tests/python/test_scrape_themes.py -q`

Expected: PASS (4 testes), sem acesso à rede.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_themes.py tests/python/test_scrape_themes.py
git commit -m "feat: scrape technology theme candidates"
```

---

### Task 3: Wrapper Node validado com Zod

**Files:**
- Create: `src/lib/scraping/runScrapeThemes.ts`
- Test: `src/lib/scraping/runScrapeThemes.test.ts`

**Interfaces:**
- Consumes: `execFile(file: string, args: readonly string[], callback)`; stdout do script `{"candidates": [...]}`
- Produces: `interface ScrapedCandidate { sourceUrl: string; headline: string; summary: string; referenceImageUrls: string[] }`; `runScrapeThemes(): Promise<ScrapedCandidate[]>`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/scraping/runScrapeThemes.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

import { execFile } from 'node:child_process';
import { runScrapeThemes } from './runScrapeThemes';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

describe('runScrapeThemes', () => {
  beforeEach(() => vi.mocked(execFile).mockReset());

  test('returns candidates parsed from the Python stdout', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      (callback as ExecCallback)(null, JSON.stringify({ candidates: [{
        sourceUrl: 'https://example.com/news',
        headline: 'New chip',
        summary: 'A faster chip shipped.',
        referenceImageUrls: ['https://example.com/chip.jpg'],
      }] }), '');
      return {} as ReturnType<typeof execFile>;
    });

    // Act
    const result = await runScrapeThemes();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.headline).toBe('New chip');
    expect(execFile).toHaveBeenCalledWith(
      'python3',
      ['scripts/scrape_themes.py'],
      expect.anything(),
    );
  });

  test('rejects with stderr when the process fails', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      (callback as ExecCallback)(new Error('exit code 1'), '', 'browser launch failed');
      return {} as ReturnType<typeof execFile>;
    });

    // Act / Assert
    await expect(runScrapeThemes()).rejects.toThrow(
      'runScrapeThemes: Python scraper failed: browser launch failed',
    );
  });

  test('rejects non-empty stderr even when the process exits successfully', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      (callback as ExecCallback)(null, '{"candidates":[]}', 'unexpected warning');
      return {} as ReturnType<typeof execFile>;
    });

    // Act / Assert
    await expect(runScrapeThemes()).rejects.toThrow('unexpected warning');
  });

  test('rejects malformed output at the process boundary', async () => {
    // Arrange
    vi.mocked(execFile).mockImplementation((_file, _args, callback) => {
      (callback as ExecCallback)(null, '{"candidates":[{"headline":7}]}', '');
      return {} as ReturnType<typeof execFile>;
    });

    // Act / Assert
    await expect(runScrapeThemes()).rejects.toThrow('runScrapeThemes: invalid scraper output');
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- runScrapeThemes.test.ts`

Expected: FAIL com `Cannot find module './runScrapeThemes'`.

- [ ] **Step 3: Implementar**

`src/lib/scraping/runScrapeThemes.ts`:

```ts
import { execFile } from 'node:child_process';
import { z } from 'zod';

const scrapedCandidateSchema = z.object({
  sourceUrl: z.string().url(),
  headline: z.string().trim().min(1),
  summary: z.string(),
  referenceImageUrls: z.array(z.string().url()).max(2),
});

const scraperOutputSchema = z.object({
  candidates: z.array(scrapedCandidateSchema),
});

export interface ScrapedCandidate {
  sourceUrl: string;
  headline: string;
  summary: string;
  referenceImageUrls: string[];
}

function parseOutput(stdout: string): ScrapedCandidate[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return scraperOutputSchema.parse(parsed).candidates;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`runScrapeThemes: invalid scraper output: ${detail}`);
  }
}

export async function runScrapeThemes(): Promise<ScrapedCandidate[]> {
  return new Promise((resolve, reject) => {
    execFile('python3', ['scripts/scrape_themes.py'], (error, stdout, stderr) => {
      if (error || stderr.trim()) {
        const detail = stderr.trim() || error?.message || 'unknown process failure';
        reject(new Error(`runScrapeThemes: Python scraper failed: ${detail}`));
        return;
      }
      try {
        resolve(parseOutput(stdout));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npm test -- runScrapeThemes.test.ts`

Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraping/runScrapeThemes.ts src/lib/scraping/runScrapeThemes.test.ts
git commit -m "feat: add validated Python scraper wrapper"
```

---

### Task 4: Seleção e reescrita editorial de temas

**Files:**
- Create: `src/lib/ai/suggestThemes.ts`
- Test: `src/lib/ai/suggestThemes.test.ts`

**Interfaces:**
- Consumes: `ScrapedCandidate`; `resolveProvider('THEME_SUGGESTION')`; `completeWithNvidia(prompt: string, model?: string): Promise<string>`; `completeWithClaude(prompt: string, model?: string): Promise<string>`; `loadDesignSystem(): string`
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

### Task 5: Análise tolerante a falha de imagem de referência

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

### Task 6: Unicidade de URL e rota autenticada de descoberta

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260902090000_unique_theme_source_url/migration.sql`
- Create: `src/app/api/pipeline/discover/route.ts`
- Test: `src/app/api/pipeline/discover/route.test.ts`

**Interfaces:**
- Consumes: `runScrapeThemes(): Promise<ScrapedCandidate[]>`; `suggestThemes(candidates: ScrapedCandidate[]): Promise<ThemeSuggestion[]>`; `prisma.theme.upsert`; `DISCOVERY_API_TOKEN`
- Produces: `POST(request: Request): Promise<Response>`; índice único `Theme_sourceUrl_key`

- [ ] **Step 1: Escrever o teste que falha**

`src/app/api/pipeline/discover/route.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/scraping/runScrapeThemes', () => ({ runScrapeThemes: vi.fn() }));
vi.mock('@/lib/ai/suggestThemes', () => ({ suggestThemes: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { theme: { upsert: vi.fn() } } }));

import { suggestThemes } from '@/lib/ai/suggestThemes';
import { prisma } from '@/lib/prisma';
import { runScrapeThemes } from '@/lib/scraping/runScrapeThemes';
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
    vi.mocked(runScrapeThemes).mockReset();
    vi.mocked(suggestThemes).mockReset();
    vi.mocked(prisma.theme.upsert).mockReset();
  });

  test('returns 401 without the configured bearer token', async () => {
    // Arrange / Act
    const response = await POST(request('wrong-token'));

    // Assert
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(runScrapeThemes).not.toHaveBeenCalled();
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
    expect(runScrapeThemes).not.toHaveBeenCalled();
  });

  test('returns 401 when the server token is not configured', async () => {
    // Arrange
    vi.stubEnv('DISCOVERY_API_TOKEN', '');

    // Act
    const response = await POST(request());

    // Assert
    expect(response.status).toBe(401);
    expect(runScrapeThemes).not.toHaveBeenCalled();
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
    vi.mocked(runScrapeThemes).mockResolvedValue(candidates);
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
    vi.mocked(runScrapeThemes).mockRejectedValue(new Error('scraper unavailable'));

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
import { runScrapeThemes } from '@/lib/scraping/runScrapeThemes';

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
    const candidates = await runScrapeThemes();
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

### Task 7: Agendamento diário e imagem de produção

**Files:**
- Create: `.github/workflows/discover-themes.yml`
- Create: `Dockerfile`

**Interfaces:**
- Consumes: secrets `DISCOVERY_API_TOKEN` e `APP_URL`; rota `POST /api/pipeline/discover`; `requirements.txt`; scripts `npm run build` e `npm start`
- Produces: workflow diário `discover-themes`; imagem OCI que contém Node.js 22, Python 3, Scrapling e browsers

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

`Dockerfile`:

```dockerfile
FROM node:22-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH="/opt/scrapling-venv/bin:${PATH}"
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python3 -m venv /opt/scrapling-venv \
    && pip install --no-cache-dir -r requirements.txt \
    && scrapling install --force
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
CMD ["npm", "start"]
```

O requisito `scrapling[fetchers]` instala os fetchers; `scrapling install --force` baixa os browsers, dependências de sistema e componentes de fingerprint exigidos pelo projeto, conforme a documentação oficial do Scrapling. O virtualenv em `/opt/scrapling-venv` evita modificar o Python gerenciado pelo Debian e fica no `PATH` do processo final.

- [ ] **Step 2: Rodar as validações e observar qualquer falha real**

Run: `npx prettier --check .github/workflows/discover-themes.yml && docker build --target runner -t carousel-desk:discover .`

Expected: antes de corrigir qualquer erro de sintaxe, path ou dependência revelado pelo ambiente, o comando correspondente falha com mensagem específica; não avançar enquanto houver falha.

- [ ] **Step 3: Implementar os ajustes exigidos pela validação**

Manter como conteúdo final os dois arquivos completos do Step 1. Não substituir `scrapling install --force` por `playwright install`: o instalador do Scrapling também prepara Patchright/fingerprints e suas dependências. Não inserir valores de secrets no YAML ou na imagem.

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npx prettier --check .github/workflows/discover-themes.yml && docker build --target runner -t carousel-desk:discover . && docker run --rm carousel-desk:discover python3 -c "from scrapling.fetchers import StealthyFetcher; print('scrapling-ok')"`

Expected: Prettier encerra com código 0; a imagem é construída; o container imprime somente `scrapling-ok` e encerra com código 0. Depois, run: `npm test && npm run build`; expected: toda a suíte passa e o build Next.js conclui.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/discover-themes.yml Dockerfile
git commit -m "ci: schedule theme discovery and package scraper"
```

## Autorrevisão final

- [ ] Confirmar que o scraper cobre três fontes configuráveis, título, resumo, URL e no máximo duas imagens, e que pytest usa somente fixture local.
- [ ] Confirmar que stdout recebe um único JSON e que o wrapper rejeita exit error, stderr não vazia, JSON inválido e schema inválido.
- [ ] Confirmar que `suggestThemes` usa o sistema de marca, escolhe entre três e cinco itens e impede URLs inventadas.
- [ ] Confirmar que `analyzeReferenceImage` seleciona o provedor de visão e converte qualquer falha em `null`.
- [ ] Confirmar que a migration cria unicidade em `Theme.sourceUrl` e que o upsert não redefine status de temas existentes.
- [ ] Confirmar autenticação fail-closed, comparação em tempo constante e ausência de secrets hardcoded.
- [ ] Confirmar workflow diário, `workflow_dispatch`, permissões mínimas, timeout e `curl --fail-with-body`.
- [ ] Confirmar no Dockerfile `node:22-slim`, Python 3, `scrapling[fetchers]`, `scrapling install --force`, build multi-stage e `npm start`.
- [ ] Fazer um scan por marcadores de pendência, frases que deleguem implementação e trechos elididos; expected: nenhuma ocorrência fora desta instrução de revisão.
- [ ] Rodar `rg -n "\bany\b|console\.log" docs/superpowers/plans/2026-09-02-scraping-temas.md`; expected: nenhuma ocorrência em código TypeScript.
- [ ] Conferir consistência ponta a ponta de `ScrapedCandidate`, `ThemeSuggestion`, `sourceUrl`, `headlineSuggestion`, `summary` e `referenceImageUrls`.
- [ ] Rodar `python3 -m pytest tests/python -q`, `npm test`, `npm run build` e validar cobertura mínima de 80% antes do merge.
