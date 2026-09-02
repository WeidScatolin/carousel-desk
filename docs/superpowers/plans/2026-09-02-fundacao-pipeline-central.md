# Fundação + Pipeline Central Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a base do carousel-desk — schema de banco, abstração de
provedor de IA (NVIDIA/Claude), geração de copy e HTML dos slides, render em
PNG via Playwright e upload no Cloudinary — tudo testável via script/testes
diretos, sem dashboard e sem scraping ainda.

**Architecture:** Next.js (App Router, TypeScript) como esqueleto do app;
Prisma 7 + Neon Postgres como banco; funções puras em `src/lib` para cada
etapa do pipeline (copywriting, geração de HTML, render, upload), compostas
por uma função de orquestração final (`generatePostFromTheme`). Cada
provedor de IA (NVIDIA NIM, Claude) fica atrás de uma função fina e
testável; a escolha de qual usar por tarefa vem de variáveis de ambiente.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, Prisma 7 (driver
adapter `@prisma/adapter-pg` + `pg`), Neon Postgres, Vitest, `openai` SDK
(para NVIDIA NIM, API compatível com OpenAI), `@anthropic-ai/sdk`,
Playwright, Cloudinary SDK.

**Spec:** `docs/superpowers/specs/2026-09-02-carousel-desk-design.md`

## Global Constraints

- 100% free tier: Render (app), Neon (banco), Cloudinary (imagens) — sem
  VPS/Docker Compose.
- Playwright precisa rodar em processo persistente (não serverless) — vale
  para quando o app for hospedado no Render (fora do escopo deste plano,
  mas a função de render já deve ser escrita assumindo isso).
- Provedor de IA por tarefa é configurável via variáveis de ambiente
  (`PROVIDER_THEME_SUGGESTION`, `PROVIDER_IMAGE_ANALYSIS`,
  `PROVIDER_COPYWRITING`), valores `"nvidia"` ou `"claude"` — nunca
  hardcoded. A geração de HTML do slide NÃO usa IA — é determinística
  (ver Task 8) — nenhum provedor pode fazer o visual fugir do
  `DESIGN.md`.
- Render do slide deve usar viewport exato 1080x1350 com
  `deviceScaleFactor` 2x — não é "print de tela", é renderização
  controlada em alta resolução.
- TypeScript: tipar parâmetros/retornos de funções exportadas; nunca `any`
  (usar `unknown` + narrowing); `interface` para props/objetos, `type`
  para unions.
- Imutabilidade: nunca mutar objetos/arrays recebidos.
- Sem `console.log` em código de produção.
- Funções pequenas e focadas (<50 linhas), arquivos coesos (<800 linhas,
  idealmente 200-400).
- Testes no padrão AAA (Arrange-Act-Assert) com nomes descritivos.
- `DATABASE_URL` nos testes aponta para um banco Neon real de
  desenvolvimento (não há Postgres local/Docker neste projeto) — os testes
  de integração com Prisma limpam os próprios registros no `afterEach`.

---

### Task 1: Scaffold do projeto Next.js

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: alias de import `@/*` → `src/*`; script `npm test` (Vitest);
  script `npm run build` (Next.js build)

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "carousel-desk",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "^7.0.0",
    "@prisma/adapter-pg": "^7.0.0",
    "pg": "^8.13.1",
    "openai": "^4.77.0",
    "@anthropic-ai/sdk": "^0.32.1",
    "playwright": "^1.49.1",
    "cloudinary": "^2.5.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.5",
    "@types/react": "^19.0.2",
    "@types/pg": "^8.11.10",
    "prisma": "^7.0.0",
    "vitest": "^2.1.8",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "image-size": "^1.1.1",
    "dotenv": "^16.4.7"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Criar `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 4: Criar `postcss.config.mjs`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 5: Criar `src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Criar `src/app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'carousel-desk',
  description: 'Automação de carrosséis de tecnologia para Instagram',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Criar `src/app/page.tsx`**

```tsx
export default function HomePage() {
  return <main>carousel-desk</main>;
}
```

- [ ] **Step 8: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 9: Criar `vitest.setup.ts`**

```ts
import { config } from 'dotenv';

config({ path: '.env' });
```

- [ ] **Step 10: Criar `.gitignore`**

```
node_modules/
.next/
.env
src/generated/
```

- [ ] **Step 11: Criar `.env.example`**

```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
NVIDIA_API_KEY=""
ANTHROPIC_API_KEY=""
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
PROVIDER_THEME_SUGGESTION="nvidia"
PROVIDER_IMAGE_ANALYSIS="nvidia"
PROVIDER_COPYWRITING="nvidia"
```

- [ ] **Step 12: Instalar dependências e o navegador do Playwright**

Run: `npm install`
Run: `npx playwright install --with-deps chromium`
Expected: ambos completam sem erro.

- [ ] **Step 13: Verificar que o projeto builda**

Run: `npm run build`
Expected: build do Next.js conclui com sucesso (rota `/` estática gerada).

- [ ] **Step 14: Commit**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs src/app vitest.config.ts vitest.setup.ts .gitignore .env.example
git commit -m "chore: scaffold Next.js project with TypeScript, Tailwind and Vitest"
```

---

### Task 2: Schema Prisma + conexão com Neon

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Test: `src/lib/prisma.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` (env var, string de conexão Neon)
- Produces: `prisma` (instância de `PrismaClient`, exportada de
  `src/lib/prisma.ts`); modelos `Theme`, `Post`, `Slide` e enums
  `ThemeStatus`, `PostStatus`, `SlideTemplate`, `ImageSource`

- [ ] **Step 1: Criar `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ThemeStatus {
  pending
  approved
  rejected
}

model Theme {
  id                 String      @id @default(uuid())
  sourceUrl          String
  summary            String
  headlineSuggestion String
  status             ThemeStatus @default(pending)
  createdAt          DateTime    @default(now())
  posts              Post[]
}

enum PostStatus {
  generating
  pending_approval
  scheduled
  published
  rejected
  error
}

model Post {
  id              String     @id @default(uuid())
  themeId         String
  theme           Theme      @relation(fields: [themeId], references: [id])
  status          PostStatus @default(generating)
  scheduledAt     DateTime?
  publishedAt     DateTime?
  instagramPostId String?
  errorMessage    String?
  createdAt       DateTime   @default(now())
  slides          Slide[]
}

enum SlideTemplate {
  cover
  evidence
  framework
}

enum ImageSource {
  stock
  scraped
}

model Slide {
  id                 String        @id @default(uuid())
  postId             String
  post               Post          @relation(fields: [postId], references: [id])
  order              Int
  template           SlideTemplate
  htmlContent        String
  imageUrl           String?
  cloudinaryPublicId String?
  imageSource        ImageSource   @default(stock)
  sourceImageUrl     String?
  imageDeletedAt     DateTime?
}
```

- [ ] **Step 2: Preencher `.env` local com a connection string do Neon**

Copie `.env.example` para `.env` e preencha `DATABASE_URL` com a connection
string do banco Neon de desenvolvimento (obtida no painel do Neon).

- [ ] **Step 3: Gerar o client Prisma**

Run: `npx prisma generate`
Expected: gera o client em `src/generated/prisma` sem erro.

- [ ] **Step 4: Rodar a migration inicial contra o Neon**

Run: `npx prisma migrate dev --name init`
Expected: cria `prisma/migrations/<timestamp>_init/migration.sql` e aplica
no banco Neon com sucesso.

- [ ] **Step 5: Criar `src/lib/prisma.ts`**

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
```

- [ ] **Step 6: Escrever o teste de fumaça do Prisma**

`src/lib/prisma.test.ts`:

```ts
import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from './prisma';

describe('prisma client', () => {
  afterEach(async () => {
    await prisma.theme.deleteMany({
      where: { sourceUrl: 'https://example.com/prisma-smoke-test' },
    });
  });

  test('creates and reads a Theme row from the database', async () => {
    const created = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/prisma-smoke-test',
        summary: 'smoke test',
        headlineSuggestion: 'smoke test headline',
      },
    });

    const found = await prisma.theme.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(found.status).toBe('pending');
    expect(found.summary).toBe('smoke test');
  });
});
```

- [ ] **Step 7: Rodar o teste**

Run: `npm test -- prisma.test.ts`
Expected: PASS (requer `DATABASE_URL` válida no `.env`)

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/prisma.ts src/lib/prisma.test.ts
git commit -m "feat: add Prisma schema and Neon connection"
```

---

### Task 3: Resolvedor de provedor de IA por tarefa

**Files:**
- Create: `src/lib/ai/types.ts`
- Test: `src/lib/ai/types.test.ts`

**Interfaces:**
- Consumes: variáveis de ambiente `PROVIDER_THEME_SUGGESTION`,
  `PROVIDER_IMAGE_ANALYSIS`, `PROVIDER_COPYWRITING`
- Produces: `type ProviderName = 'nvidia' | 'claude'`; `type ProviderTask`;
  `function resolveProvider(task: ProviderTask, env?: NodeJS.ProcessEnv): ProviderName`

- [ ] **Step 1: Escrever o teste**

`src/lib/ai/types.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { resolveProvider } from './types';

describe('resolveProvider', () => {
  test('returns nvidia when the env var is set to nvidia', () => {
    const result = resolveProvider('COPYWRITING', {
      PROVIDER_COPYWRITING: 'nvidia',
    } as NodeJS.ProcessEnv);

    expect(result).toBe('nvidia');
  });

  test('returns claude when the env var is set to claude', () => {
    const result = resolveProvider('IMAGE_ANALYSIS', {
      PROVIDER_IMAGE_ANALYSIS: 'claude',
    } as NodeJS.ProcessEnv);

    expect(result).toBe('claude');
  });

  test('throws when the env var is missing', () => {
    expect(() => resolveProvider('THEME_SUGGESTION', {} as NodeJS.ProcessEnv)).toThrow(
      'Missing or invalid PROVIDER_THEME_SUGGESTION'
    );
  });

  test('throws when the env var has an invalid value', () => {
    expect(() =>
      resolveProvider('IMAGE_ANALYSIS', { PROVIDER_IMAGE_ANALYSIS: 'gpt4' } as NodeJS.ProcessEnv)
    ).toThrow('Missing or invalid PROVIDER_IMAGE_ANALYSIS');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- types.test.ts`
Expected: FAIL com "Cannot find module './types'" ou similar

- [ ] **Step 3: Implementar `src/lib/ai/types.ts`**

```ts
export type ProviderName = 'nvidia' | 'claude';

export type ProviderTask = 'THEME_SUGGESTION' | 'IMAGE_ANALYSIS' | 'COPYWRITING';

const ENV_VAR_BY_TASK: Record<ProviderTask, string> = {
  THEME_SUGGESTION: 'PROVIDER_THEME_SUGGESTION',
  IMAGE_ANALYSIS: 'PROVIDER_IMAGE_ANALYSIS',
  COPYWRITING: 'PROVIDER_COPYWRITING',
};

export function resolveProvider(
  task: ProviderTask,
  env: NodeJS.ProcessEnv = process.env
): ProviderName {
  const envVarName = ENV_VAR_BY_TASK[task];
  const value = env[envVarName];

  if (value === 'nvidia' || value === 'claude') {
    return value;
  }

  throw new Error(
    `Missing or invalid ${envVarName} — expected "nvidia" or "claude", got "${String(value)}"`
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- types.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/types.ts src/lib/ai/types.test.ts
git commit -m "feat: add per-task AI provider resolver"
```

---

### Task 4: Cliente NVIDIA NIM

**Files:**
- Create: `src/lib/ai/nvidiaClient.ts`
- Test: `src/lib/ai/nvidiaClient.test.ts`

**Interfaces:**
- Consumes: `NVIDIA_API_KEY` (env var); pacote `openai`
- Produces: `function completeWithNvidia(prompt: string, model?: string): Promise<string>`

- [ ] **Step 1: Escrever o teste**

`src/lib/ai/nvidiaClient.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { completeWithNvidia } from './nvidiaClient';

describe('completeWithNvidia', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.NVIDIA_API_KEY = 'test-key';
  });

  test('returns the completion content from NVIDIA', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'hello from nvidia' } }],
    });

    const result = await completeWithNvidia('say hello');

    expect(result).toBe('hello from nvidia');
  });

  test('throws when NVIDIA returns no content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(completeWithNvidia('say hello')).rejects.toThrow(
      'NVIDIA response contained no content'
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- nvidiaClient.test.ts`
Expected: FAIL com "Cannot find module './nvidiaClient'"

- [ ] **Step 3: Implementar `src/lib/ai/nvidiaClient.ts`**

```ts
import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY is not set');
    }
    client = new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1' });
  }
  return client;
}

export async function completeWithNvidia(
  prompt: string,
  model = 'meta/llama-3.3-70b-instruct'
): Promise<string> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('NVIDIA response contained no content');
  }

  return content;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- nvidiaClient.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/nvidiaClient.ts src/lib/ai/nvidiaClient.test.ts
git commit -m "feat: add NVIDIA NIM text completion client"
```

---

### Task 5: Cliente Claude (Anthropic)

**Files:**
- Create: `src/lib/ai/claudeClient.ts`
- Test: `src/lib/ai/claudeClient.test.ts`

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY` (env var); pacote `@anthropic-ai/sdk`
- Produces: `function completeWithClaude(prompt: string, model?: string): Promise<string>`

- [ ] **Step 1: Escrever o teste**

`src/lib/ai/claudeClient.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { completeWithClaude } from './claudeClient';

describe('completeWithClaude', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  test('returns the text content from Claude', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello from claude' }],
    });

    const result = await completeWithClaude('say hello');

    expect(result).toBe('hello from claude');
  });

  test('throws when Claude returns no text block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'image' }] });

    await expect(completeWithClaude('say hello')).rejects.toThrow(
      'Claude response contained no text content'
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- claudeClient.test.ts`
Expected: FAIL com "Cannot find module './claudeClient'"

- [ ] **Step 3: Implementar `src/lib/ai/claudeClient.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function completeWithClaude(
  prompt: string,
  model = 'claude-sonnet-5'
): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Claude response contained no text content');
  }

  return block.text;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- claudeClient.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/claudeClient.ts src/lib/ai/claudeClient.test.ts
git commit -m "feat: add Claude text completion client"
```

---

### Task 6: Arquivo de sistema de marca (DESIGN.md) + loader

**Files:**
- Create: `docs/brand/DESIGN.md`
- Create: `src/lib/ai/designSystem.ts`
- Test: `src/lib/ai/designSystem.test.ts`

**Interfaces:**
- Consumes: arquivo `docs/brand/DESIGN.md` (lido do disco)
- Produces: `function loadDesignSystem(): string`

- [ ] **Step 1: Criar `docs/brand/DESIGN.md`**

```markdown
# carousel-desk — Brand System

## Paleta
- Preto carvão: #0A0A0A (fundo escuro)
- Creme: #F2F0E8 (fundo claro)
- Laranja-vermelho: #FF3B0A (destaque/atenção — usar em no máximo uma
  palavra ou trecho por bloco, nunca como preenchimento)
- Roxo-preto: #11101D (fundo alternativo escuro)

## Tipografia
- Manchetes: fonte condensada pesada, caixa alta (Barlow Condensed
  ExtraBold, Oswald Heavy ou Bebas Neue)
- Corpo de texto: Inter ou Manrope
- Acentos editoriais: serifada (Instrument Serif ou Cormorant Garamond)

## Formato
1080x1350px, margens de 64 a 80px.

## Templates

### cover (capa cinematográfica)
Foto full-bleed, fundo escurecido na metade inferior, título de 3 a 6
linhas ocupando no máximo 14 a 18 palavras, uma expressão em destaque na
cor laranja-vermelho, microtexto/subtítulo pequeno.

### evidence (página de evidência)
Fundo claro (creme), gráficos/prints/dados, fonte pequena no rodapé
citando a origem do dado.

### framework (página de framework/checklist)
Fundo escuro ou claro, uma tese principal por página, modelo prático
aplicável (checklist, comparação, "Modelo 01").

## Tom editorial
Confiante, levemente provocador, analítico ("explico o mecanismo" em vez
de "5 dicas"). Foco em tecnologia, comportamento digital e negócios.

## Correções deliberadas (não copiar referência literalmente)
Manchetes curtas; assinatura visual própria (numeração/moldura
reconhecível); evidência real citada; menos rostos famosos, mais
diagramas próprios; slides respirados (uma tese por página); conclusão
que entrega uma ferramenta salvável, não só uma frase de efeito.
```

- [ ] **Step 2: Escrever o teste do loader**

`src/lib/ai/designSystem.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { loadDesignSystem } from './designSystem';

describe('loadDesignSystem', () => {
  test('loads the brand system content including the color palette', () => {
    const content = loadDesignSystem();

    expect(content).toContain('#FF3B0A');
    expect(content).toContain('cover (capa cinematográfica)');
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- designSystem.test.ts`
Expected: FAIL com "Cannot find module './designSystem'"

- [ ] **Step 4: Implementar `src/lib/ai/designSystem.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | null = null;

export function loadDesignSystem(): string {
  if (cached === null) {
    const path = join(process.cwd(), 'docs', 'brand', 'DESIGN.md');
    cached = readFileSync(path, 'utf-8');
  }
  return cached;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- designSystem.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 6: Commit**

```bash
git add docs/brand/DESIGN.md src/lib/ai/designSystem.ts src/lib/ai/designSystem.test.ts
git commit -m "feat: add brand system file and loader"
```

---

### Task 7: Geração de copy (`writeCopy`)

**Files:**
- Create: `src/lib/ai/writeCopy.ts`
- Test: `src/lib/ai/writeCopy.test.ts`

**Interfaces:**
- Consumes: `resolveProvider` (Task 3), `completeWithNvidia` (Task 4),
  `completeWithClaude` (Task 5), `loadDesignSystem` (Task 6)
- Produces: `interface ThemeInput { headlineSuggestion: string; summary: string }`;
  `interface SlideCopy { template: 'cover' | 'evidence' | 'framework'; headline: string; body: string }`;
  `function writeCopy(theme: ThemeInput): Promise<SlideCopy[]>`

- [ ] **Step 1: Escrever o teste**

`src/lib/ai/writeCopy.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./nvidiaClient', () => ({ completeWithNvidia: vi.fn() }));
vi.mock('./claudeClient', () => ({ completeWithClaude: vi.fn() }));

import { completeWithNvidia } from './nvidiaClient';
import { completeWithClaude } from './claudeClient';
import { writeCopy } from './writeCopy';

describe('writeCopy', () => {
  beforeEach(() => {
    vi.mocked(completeWithNvidia).mockReset();
    vi.mocked(completeWithClaude).mockReset();
  });

  test('parses valid JSON copy from the configured provider', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(
      JSON.stringify([{ template: 'cover', headline: 'Título', body: 'Corpo' }])
    );

    const result = await writeCopy({
      headlineSuggestion: 'IA generativa',
      summary: 'resumo',
    });

    expect(result).toEqual([{ template: 'cover', headline: 'Título', body: 'Corpo' }]);
    expect(completeWithClaude).toHaveBeenCalledTimes(1);
    expect(completeWithNvidia).not.toHaveBeenCalled();
  });

  test('throws when provider response is not valid JSON', async () => {
    process.env.PROVIDER_COPYWRITING = 'nvidia';
    vi.mocked(completeWithNvidia).mockResolvedValue('not json');

    await expect(
      writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' })
    ).rejects.toThrow('writeCopy: provider response was not valid JSON');
  });

  test('throws when a slide is missing required fields', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(JSON.stringify([{ template: 'cover' }]));

    await expect(
      writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' })
    ).rejects.toThrow('slide at index 0 is missing required fields');
  });

  test('throws when a slide has an invalid template', async () => {
    process.env.PROVIDER_COPYWRITING = 'claude';
    vi.mocked(completeWithClaude).mockResolvedValue(
      JSON.stringify([{ template: 'invalid', headline: 'Título', body: 'Corpo' }])
    );

    await expect(
      writeCopy({ headlineSuggestion: 'IA generativa', summary: 'resumo' })
    ).rejects.toThrow('slide at index 0 has invalid template "invalid"');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- writeCopy.test.ts`
Expected: FAIL com "Cannot find module './writeCopy'"

- [ ] **Step 3: Implementar `src/lib/ai/writeCopy.ts`**

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- writeCopy.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/writeCopy.ts src/lib/ai/writeCopy.test.ts
git commit -m "feat: add slide copywriting pipeline step"
```

---

### Task 8: Templates determinísticos de slide (`generateSlideHtml`)

Esta etapa NÃO usa IA — é uma trava proposital: o visual do slide (cores,
tipografia, layout) vem sempre do `DESIGN.md`, embutido diretamente no
código, independente de qual provedor (ou nenhum) gerou o texto. A IA só
escreve `headline`/`body` (Task 7); esta task só posiciona esse texto
dentro de um dos três templates fixos.

**Files:**
- Create: `src/lib/ai/generateSlideHtml.ts`
- Test: `src/lib/ai/generateSlideHtml.test.ts`

**Interfaces:**
- Consumes: `SlideCopy` (Task 7)
- Produces: `function generateSlideHtml(slide: SlideCopy): string`

- [ ] **Step 1: Escrever o teste**

`src/lib/ai/generateSlideHtml.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { generateSlideHtml } from './generateSlideHtml';

describe('generateSlideHtml', () => {
  test('renders a cover slide with the dark background and an accented headline', () => {
    const html = generateSlideHtml({ template: 'cover', headline: 'IA muda o jogo', body: 'Resumo' });

    expect(html).toContain('#0A0A0A');
    expect(html).toContain('IA muda o');
    expect(html).toContain('#FF3B0A');
  });

  test('renders an evidence slide with the cream background', () => {
    const html = generateSlideHtml({ template: 'evidence', headline: 'Os dados mostram X', body: 'Resumo' });

    expect(html).toContain('#F2F0E8');
    expect(html).toContain('Resumo');
  });

  test('renders a framework slide as a checklist when the body has multiple lines', () => {
    const html = generateSlideHtml({
      template: 'framework',
      headline: 'Modelo 01',
      body: 'Primeiro passo\nSegundo passo',
    });

    expect(html).toContain('<ul');
    expect(html).toContain('Primeiro passo');
    expect(html).toContain('Segundo passo');
  });

  test('escapes HTML special characters in the headline and body', () => {
    const html = generateSlideHtml({
      template: 'cover',
      headline: 'Menos <script> mais resultado',
      body: '<b>teste</b>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;teste&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- generateSlideHtml.test.ts`
Expected: FAIL com "Cannot find module './generateSlideHtml'"

- [ ] **Step 3: Implementar `src/lib/ai/generateSlideHtml.ts`**

```ts
import type { SlideCopy } from './writeCopy';

const PALETTE = {
  charcoal: '#0A0A0A',
  cream: '#F2F0E8',
  accent: '#FF3B0A',
  purpleBlack: '#11101D',
} as const;

const HEADLINE_FONT_STACK = '"Arial Narrow", Arial, sans-serif';
const BODY_FONT_STACK = 'Arial, Helvetica, sans-serif';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHeadlineWithAccent(headline: string): string {
  const words = headline.trim().split(/\s+/);
  const lastWord = words.pop() ?? '';
  const rest = words.map(escapeHtml).join(' ');
  return `${rest} <span style="color:${PALETTE.accent}">${escapeHtml(lastWord)}</span>`;
}

function renderCoverSlide(slide: SlideCopy): string {
  return `<!doctype html>
<html>
  <body style="margin:0;width:1080px;height:1350px;background:${PALETTE.charcoal};display:flex;align-items:flex-end;box-sizing:border-box;padding:64px;">
    <div>
      <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.cream};font-size:28px;margin:0 0 16px;">${escapeHtml(slide.body)}</p>
      <h1 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.cream};font-size:72px;line-height:1.05;margin:0;">${renderHeadlineWithAccent(slide.headline)}</h1>
    </div>
  </body>
</html>`;
}

function renderEvidenceSlide(slide: SlideCopy): string {
  return `<!doctype html>
<html>
  <body style="margin:0;width:1080px;height:1350px;background:${PALETTE.cream};box-sizing:border-box;padding:64px;display:flex;flex-direction:column;justify-content:center;">
    <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;color:${PALETTE.charcoal};font-size:56px;line-height:1.1;margin:0 0 32px;">${renderHeadlineWithAccent(slide.headline)}</h2>
    <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:32px;line-height:1.4;margin:0;">${escapeHtml(slide.body)}</p>
    <p style="font-family:${BODY_FONT_STACK};color:${PALETTE.charcoal};font-size:18px;opacity:0.6;margin-top:auto;">@carousel-desk</p>
  </body>
</html>`;
}

function renderFrameworkSlide(slide: SlideCopy): string {
  const lines = slide.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyHtml =
    lines.length > 1
      ? `<ul style="padding-left:32px;margin:0;">${lines
          .map((line) => `<li style="margin-bottom:16px;">${escapeHtml(line)}</li>`)
          .join('')}</ul>`
      : `<p style="margin:0;">${escapeHtml(slide.body)}</p>`;

  return `<!doctype html>
<html>
  <body style="margin:0;width:1080px;height:1350px;background:${PALETTE.purpleBlack};color:${PALETTE.cream};box-sizing:border-box;padding:64px;display:flex;flex-direction:column;justify-content:center;font-family:${BODY_FONT_STACK};font-size:30px;line-height:1.4;">
    <h2 style="font-family:${HEADLINE_FONT_STACK};font-weight:800;text-transform:uppercase;font-size:56px;line-height:1.1;margin:0 0 32px;">${renderHeadlineWithAccent(slide.headline)}</h2>
    ${bodyHtml}
  </body>
</html>`;
}

export function generateSlideHtml(slide: SlideCopy): string {
  switch (slide.template) {
    case 'cover':
      return renderCoverSlide(slide);
    case 'evidence':
      return renderEvidenceSlide(slide);
    case 'framework':
      return renderFrameworkSlide(slide);
    default: {
      const exhaustiveCheck: never = slide.template;
      throw new Error(`generateSlideHtml: unknown template "${String(exhaustiveCheck)}"`);
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- generateSlideHtml.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/generateSlideHtml.ts src/lib/ai/generateSlideHtml.test.ts
git commit -m "feat: add deterministic slide HTML templates (no AI, brand-locked)"
```

---

### Task 9: Render do slide em PNG (Playwright)

**Files:**
- Create: `src/lib/render/renderSlideToImage.ts`
- Test: `src/lib/render/renderSlideToImage.test.ts`

**Interfaces:**
- Consumes: pacotes `playwright`, `image-size` (só no teste)
- Produces: `function renderSlideToImage(html: string): Promise<Buffer>`

- [ ] **Step 1: Escrever o teste**

`src/lib/render/renderSlideToImage.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- renderSlideToImage.test.ts`
Expected: FAIL com "Cannot find module './renderSlideToImage'"

- [ ] **Step 3: Implementar `src/lib/render/renderSlideToImage.ts`**

```ts
import { chromium } from 'playwright';

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;
const DEVICE_SCALE_FACTOR = 2;

export async function renderSlideToImage(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- renderSlideToImage.test.ts`
Expected: PASS (1 teste — pode levar alguns segundos por abrir um
Chromium real)

- [ ] **Step 5: Commit**

```bash
git add src/lib/render/renderSlideToImage.ts src/lib/render/renderSlideToImage.test.ts
git commit -m "feat: add Playwright HTML-to-PNG slide renderer"
```

---

### Task 10: Upload e remoção de imagem no Cloudinary

**Files:**
- Create: `src/lib/storage/cloudinary.ts`
- Test: `src/lib/storage/cloudinary.test.ts`

**Interfaces:**
- Consumes: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` (env vars); pacote `cloudinary`
- Produces: `interface UploadedImage { url: string; publicId: string }`;
  `function uploadSlideImage(buffer: Buffer, publicId: string): Promise<UploadedImage>`;
  `function deleteSlideImage(publicId: string): Promise<void>`

- [ ] **Step 1: Escrever o teste**

`src/lib/storage/cloudinary.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockUploadStream = vi.fn();
const mockDestroy = vi.fn();

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: mockUploadStream,
      destroy: mockDestroy,
    },
  },
}));

import { uploadSlideImage, deleteSlideImage } from './cloudinary';

describe('uploadSlideImage', () => {
  beforeEach(() => {
    mockUploadStream.mockReset();
  });

  test('resolves with the secure URL and public ID on success', async () => {
    mockUploadStream.mockImplementation((_options, callback) => {
      callback(null, {
        secure_url: 'https://cloudinary.test/img.png',
        public_id: 'carousel-desk/slides/abc',
      });
      return { end: vi.fn() };
    });

    const result = await uploadSlideImage(Buffer.from('fake-png'), 'abc');

    expect(result).toEqual({
      url: 'https://cloudinary.test/img.png',
      publicId: 'carousel-desk/slides/abc',
    });
  });

  test('rejects when Cloudinary returns an error', async () => {
    mockUploadStream.mockImplementation((_options, callback) => {
      callback(new Error('upload failed'), null);
      return { end: vi.fn() };
    });

    await expect(uploadSlideImage(Buffer.from('fake-png'), 'abc')).rejects.toThrow('upload failed');
  });
});

describe('deleteSlideImage', () => {
  test('calls Cloudinary destroy with the public ID', async () => {
    mockDestroy.mockResolvedValue({ result: 'ok' });

    await deleteSlideImage('carousel-desk/slides/abc');

    expect(mockDestroy).toHaveBeenCalledWith('carousel-desk/slides/abc');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- cloudinary.test.ts`
Expected: FAIL com "Cannot find module './cloudinary'"

- [ ] **Step 3: Implementar `src/lib/storage/cloudinary.ts`**

```ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadedImage {
  url: string;
  publicId: string;
}

export async function uploadSlideImage(buffer: Buffer, publicId: string): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'carousel-desk/slides', resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('uploadSlideImage: no result returned from Cloudinary'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteSlideImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- cloudinary.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/cloudinary.ts src/lib/storage/cloudinary.test.ts
git commit -m "feat: add Cloudinary upload and delete for slide images"
```

---

### Task 11: Orquestração do pipeline (`generatePostFromTheme`)

**Files:**
- Create: `src/lib/pipeline/generatePostFromTheme.ts`
- Test: `src/lib/pipeline/generatePostFromTheme.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `writeCopy` (Task 7), `generateSlideHtml`
  (Task 8), `renderSlideToImage` (Task 9), `uploadSlideImage` (Task 10)
- Produces: `function generatePostFromTheme(themeId: string): Promise<string>`
  (retorna o `id` do `Post` criado)

- [ ] **Step 1: Escrever o teste**

`src/lib/pipeline/generatePostFromTheme.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../ai/writeCopy', () => ({ writeCopy: vi.fn() }));
vi.mock('../ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn() }));
vi.mock('../render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));
vi.mock('../storage/cloudinary', () => ({ uploadSlideImage: vi.fn() }));

import { writeCopy } from '../ai/writeCopy';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';
import { generatePostFromTheme } from './generatePostFromTheme';
import { prisma } from '@/lib/prisma';

describe('generatePostFromTheme', () => {
  let themeId: string;

  beforeEach(async () => {
    vi.mocked(writeCopy).mockReset();
    vi.mocked(generateSlideHtml).mockReset();
    vi.mocked(renderSlideToImage).mockReset();
    vi.mocked(uploadSlideImage).mockReset();

    const theme = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/news',
        summary: 'resumo de teste',
        headlineSuggestion: 'Tema de teste',
        status: 'approved',
      },
    });
    themeId = theme.id;
  });

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId } } });
    await prisma.post.deleteMany({ where: { themeId } });
    await prisma.theme.delete({ where: { id: themeId } });
  });

  test('creates a post with generated slides and marks it pending_approval', async () => {
    vi.mocked(writeCopy).mockResolvedValue([
      { template: 'cover', headline: 'Título', body: 'Corpo' },
    ]);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html><body>slide</body></html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({
      url: 'https://cloudinary.test/img.png',
      publicId: 'test-public-id',
    });

    const postId = await generatePostFromTheme(themeId);

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { slides: true },
    });

    expect(post.status).toBe('pending_approval');
    expect(post.slides).toHaveLength(1);
    expect(post.slides[0].imageUrl).toBe('https://cloudinary.test/img.png');
  });

  test('marks the post as error when generation fails', async () => {
    vi.mocked(writeCopy).mockRejectedValue(new Error('provider unavailable'));

    await expect(generatePostFromTheme(themeId)).rejects.toThrow('provider unavailable');

    const posts = await prisma.post.findMany({ where: { themeId } });

    expect(posts).toHaveLength(1);
    expect(posts[0].status).toBe('error');
    expect(posts[0].errorMessage).toBe('provider unavailable');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- generatePostFromTheme.test.ts`
Expected: FAIL com "Cannot find module './generatePostFromTheme'"

- [ ] **Step 3: Implementar `src/lib/pipeline/generatePostFromTheme.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { writeCopy } from '../ai/writeCopy';
import { generateSlideHtml } from '../ai/generateSlideHtml';
import { renderSlideToImage } from '../render/renderSlideToImage';
import { uploadSlideImage } from '../storage/cloudinary';

export async function generatePostFromTheme(themeId: string): Promise<string> {
  const theme = await prisma.theme.findUniqueOrThrow({ where: { id: themeId } });

  const post = await prisma.post.create({
    data: { themeId: theme.id, status: 'generating' },
  });

  try {
    const slidesCopy = await writeCopy({
      headlineSuggestion: theme.headlineSuggestion,
      summary: theme.summary,
    });

    for (const [index, slideCopy] of slidesCopy.entries()) {
      const html = await generateSlideHtml(slideCopy);
      const imageBuffer = await renderSlideToImage(html);
      const publicId = `${post.id}-slide-${index}`;
      const uploaded = await uploadSlideImage(imageBuffer, publicId);

      await prisma.slide.create({
        data: {
          postId: post.id,
          order: index,
          template: slideCopy.template,
          htmlContent: html,
          imageUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          imageSource: 'stock',
        },
      });
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { status: 'pending_approval' },
    });

    return updated.id;
  } catch (error) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- generatePostFromTheme.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Rodar a suíte completa de testes do plano**

Run: `npm test`
Expected: todos os testes de todas as 11 tasks passam

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline/generatePostFromTheme.ts src/lib/pipeline/generatePostFromTheme.test.ts
git commit -m "feat: wire up end-to-end pipeline from approved theme to pending post"
```
