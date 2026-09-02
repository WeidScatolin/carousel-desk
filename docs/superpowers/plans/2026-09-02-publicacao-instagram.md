# Publicação no Instagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar automaticamente no Instagram os carrosséis agendados e vencidos, registrar o resultado no banco e remover do Cloudinary somente as imagens publicadas com sucesso.

**Architecture:** Um cliente isolado encapsula as três etapas da Instagram Graph API: containers dos itens, container do carrossel e publicação. Uma rota protegida por bearer token consulta no Prisma apenas posts `scheduled` vencidos, processa cada post e persiste sucesso ou erro; após sucesso, limpa cada imagem no Cloudinary. Um workflow do GitHub Actions chama a rota a cada 15 minutos.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 + Neon Postgres, Vitest, Meta Instagram Graph API v21.0, Cloudinary SDK, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-carousel-desk-design.md`

## Global Constraints

- Usar exclusivamente a API oficial do Instagram em `https://graph.facebook.com/v21.0`; automação não oficial está fora de escopo.
- `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` e `PUBLISH_API_TOKEN` vêm de variáveis de ambiente; nunca hardcodear credenciais.
- A rota aceita somente `Authorization: Bearer <PUBLISH_API_TOKEN>` e retorna `401` para token ausente, configuração ausente ou valor diferente.
- Selecionar somente `Post.status = "scheduled"` com `scheduledAt <= now()`, incluindo `slides` em ordem crescente de `order`.
- Em sucesso, persistir `status = "published"`, `publishedAt`, `instagramPostId`; depois apagar cada imagem via `deleteSlideImage(publicId: string): Promise<void>` e persistir `imageUrl = null`, `imageDeletedAt`.
- Em falha de publicação, persistir `status = "error"` e `errorMessage`; não apagar nenhuma imagem do Cloudinary.
- Não implementar fila nem retry automático; o erro permanece visível para inspeção e reprocessamento posterior.
- Reutilizar `prisma` de `src/lib/prisma.ts` e `deleteSlideImage` de `src/lib/storage/cloudinary.ts`; não reimplementar clientes existentes.
- `Slide.imageUrl` e `Slide.cloudinaryPublicId` são nullable; validar ambos antes de chamar serviços que exigem `string`.
- TypeScript estrito: retornos exportados explícitos, sem `any` (usar `unknown` e narrowing), sem mutar argumentos e sem `console.log`.
- Funções pequenas e focadas (<50 linhas), testes AAA em Vitest e cobertura mínima de 80% para a lógica de publicação e rota.
- Testes Prisma usam o banco Neon real de desenvolvimento via `DATABASE_URL` e removem os próprios registros em `afterEach`.

---

### Task 1: Cliente da Instagram Graph API

**Files:**
- Create: `src/lib/instagram/publishCarousel.ts`
- Test: `src/lib/instagram/publishCarousel.test.ts`

**Interfaces:**
- Consumes: `INSTAGRAM_ACCESS_TOKEN` (env var); `fetch` global; Graph API v21.0
- Produces: `function publishCarousel(post: { instagramBusinessAccountId: string; slides: { imageUrl: string }[] }): Promise<string>`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/instagram/publishCarousel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { publishCarousel } from './publishCarousel';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('publishCarousel', () => {
  beforeEach(() => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test-access-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });

  test('creates item containers, creates the carousel and publishes it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'item-2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'carousel-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'instagram-post-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishCarousel({
      instagramBusinessAccountId: 'ig-user-1',
      slides: [
        { imageUrl: 'https://cdn.test/slide-1.png' },
        { imageUrl: 'https://cdn.test/slide-2.png' },
      ],
    });

    expect(result).toBe('instagram-post-1');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://graph.facebook.com/v21.0/ig-user-1/media',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          image_url: 'https://cdn.test/slide-1.png',
          is_carousel_item: 'true',
          access_token: 'test-access-token',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://graph.facebook.com/v21.0/ig-user-1/media',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          image_url: 'https://cdn.test/slide-2.png',
          is_carousel_item: 'true',
          access_token: 'test-access-token',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://graph.facebook.com/v21.0/ig-user-1/media',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          media_type: 'CAROUSEL',
          children: 'item-1,item-2',
          access_token: 'test-access-token',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://graph.facebook.com/v21.0/ig-user-1/media_publish',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          creation_id: 'carousel-1',
          access_token: 'test-access-token',
        }),
      })
    );
  });

  test('throws a clear error with the Meta body when an item container fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Unsupported image format' } }, 400)
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publishCarousel({
        instagramBusinessAccountId: 'ig-user-1',
        slides: [
          { imageUrl: 'https://cdn.test/slide-1.png' },
          { imageUrl: 'https://cdn.test/slide-2.png' },
        ],
      })
    ).rejects.toThrow(
      'Instagram Graph API item container failed with 400: {"error":{"message":"Unsupported image format"}}'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('throws a clear error with the Meta body when final publication fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'carousel-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Media is not ready' } }, 500)
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publishCarousel({
        instagramBusinessAccountId: 'ig-user-1',
        slides: [{ imageUrl: 'https://cdn.test/slide-1.png' }],
      })
    ).rejects.toThrow(
      'Instagram Graph API publication failed with 500: {"error":{"message":"Media is not ready"}}'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- publishCarousel.test.ts`

Expected: FAIL com `Cannot find module './publishCarousel'`.

- [ ] **Step 3: Implementar**

`src/lib/instagram/publishCarousel.ts`:

```ts
const GRAPH_API_BASE_URL = 'https://graph.facebook.com/v21.0';

interface GraphIdResponse {
  id: string;
}

function getAccessToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error('publishCarousel: INSTAGRAM_ACCESS_TOKEN is not configured');
  }
  return token;
}

function parseId(payload: unknown, operation: string): GraphIdResponse {
  if (typeof payload !== 'object' || payload === null || !('id' in payload)) {
    throw new Error(`Instagram Graph API ${operation} returned no id`);
  }
  const id = (payload as Record<string, unknown>).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`Instagram Graph API ${operation} returned an invalid id`);
  }
  return { id };
}

async function postForm(
  path: string,
  form: URLSearchParams,
  operation: string
): Promise<GraphIdResponse> {
  const response = await fetch(`${GRAPH_API_BASE_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Instagram Graph API ${operation} failed with ${response.status}: ${body}`
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Instagram Graph API ${operation} returned invalid JSON: ${body}`);
  }
  return parseId(payload, operation);
}

async function createItemContainer(
  accountId: string,
  imageUrl: string,
  token: string
): Promise<string> {
  const form = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: token,
  });
  return (await postForm(`${accountId}/media`, form, 'item container')).id;
}

export async function publishCarousel(post: {
  instagramBusinessAccountId: string;
  slides: { imageUrl: string }[];
}): Promise<string> {
  const token = getAccessToken();
  const children: string[] = [];
  for (const slide of post.slides) {
    children.push(
      await createItemContainer(post.instagramBusinessAccountId, slide.imageUrl, token)
    );
  }
  const carousel = await postForm(
    `${post.instagramBusinessAccountId}/media`,
    new URLSearchParams({
      media_type: 'CAROUSEL',
      children: children.join(','),
      access_token: token,
    }),
    'carousel container'
  );
  return (
    await postForm(
      `${post.instagramBusinessAccountId}/media_publish`,
      new URLSearchParams({ creation_id: carousel.id, access_token: token }),
      'publication'
    )
  ).id;
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npm test -- publishCarousel.test.ts`

Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram/publishCarousel.ts src/lib/instagram/publishCarousel.test.ts
git commit -m "feat: add Instagram carousel publishing client"
```

---

### Task 2: Rota protegida de publicação e limpeza pós-publicação

**Files:**
- Create: `src/app/api/pipeline/publish/route.ts`
- Test: `src/app/api/pipeline/publish/route.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `prisma` de `src/lib/prisma.ts`; `publishCarousel(post: { instagramBusinessAccountId: string; slides: { imageUrl: string }[] }): Promise<string>` (Task 1); `deleteSlideImage(publicId: string): Promise<void>`; `PUBLISH_API_TOKEN` e `INSTAGRAM_BUSINESS_ACCOUNT_ID` (env vars)
- Produces: `function POST(request: Request): Promise<Response>` em `/api/pipeline/publish`; JSON `{ processed: number; published: number; failed: number }`

- [ ] **Step 1: Escrever o teste que falha**

`src/app/api/pipeline/publish/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/instagram/publishCarousel', () => ({ publishCarousel: vi.fn() }));
vi.mock('@/lib/storage/cloudinary', () => ({ deleteSlideImage: vi.fn() }));

import { publishCarousel } from '@/lib/instagram/publishCarousel';
import { prisma } from '@/lib/prisma';
import { deleteSlideImage } from '@/lib/storage/cloudinary';
import { POST } from './route';

describe('POST /api/pipeline/publish', () => {
  const themeIds: string[] = [];

  beforeEach(() => {
    process.env.PUBLISH_API_TOKEN = 'publish-secret';
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = 'ig-business-1';
    vi.mocked(publishCarousel).mockReset();
    vi.mocked(deleteSlideImage).mockReset();
    vi.mocked(deleteSlideImage).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId: { in: themeIds } } } });
    await prisma.post.deleteMany({ where: { themeId: { in: themeIds } } });
    await prisma.theme.deleteMany({ where: { id: { in: themeIds } } });
    themeIds.splice(0, themeIds.length);
    delete process.env.PUBLISH_API_TOKEN;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  });

  async function createScheduledPost(scheduledAt: Date = new Date(Date.now() - 60_000)) {
    const theme = await prisma.theme.create({
      data: {
        sourceUrl: `https://example.com/${crypto.randomUUID()}`,
        summary: 'Resumo de teste',
        headlineSuggestion: 'Tema de teste',
        status: 'approved',
      },
    });
    themeIds.push(theme.id);
    return prisma.post.create({
      data: {
        themeId: theme.id,
        status: 'scheduled',
        scheduledAt,
        slides: {
          create: [
            {
              order: 1,
              template: 'evidence',
              htmlContent: '<html>slide 2</html>',
              imageUrl: 'https://cdn.test/slide-2.png',
              cloudinaryPublicId: 'slide-2',
            },
            {
              order: 0,
              template: 'cover',
              htmlContent: '<html>slide 1</html>',
              imageUrl: 'https://cdn.test/slide-1.png',
              cloudinaryPublicId: 'slide-1',
            },
          ],
        },
      },
      include: { slides: true },
    });
  }

  function authorizedRequest(): Request {
    return new Request('http://localhost/api/pipeline/publish', {
      method: 'POST',
      headers: { Authorization: 'Bearer publish-secret' },
    });
  }

  test('returns 401 when the bearer token does not match', async () => {
    const response = await POST(
      new Request('http://localhost/api/pipeline/publish', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(publishCarousel).not.toHaveBeenCalled();
  });

  test('publishes due posts in slide order and removes their Cloudinary images', async () => {
    const post = await createScheduledPost();
    vi.mocked(publishCarousel).mockResolvedValue('instagram-post-1');

    const response = await POST(authorizedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 1, published: 1, failed: 0 });
    expect(publishCarousel).toHaveBeenCalledWith({
      instagramBusinessAccountId: 'ig-business-1',
      slides: [
        { imageUrl: 'https://cdn.test/slide-1.png' },
        { imageUrl: 'https://cdn.test/slide-2.png' },
      ],
    });
    expect(deleteSlideImage).toHaveBeenNthCalledWith(1, 'slide-1');
    expect(deleteSlideImage).toHaveBeenNthCalledWith(2, 'slide-2');
    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { slides: { orderBy: { order: 'asc' } } },
    });
    expect(stored.status).toBe('published');
    expect(stored.instagramPostId).toBe('instagram-post-1');
    expect(stored.publishedAt).toBeInstanceOf(Date);
    expect(stored.slides.every((slide) => slide.imageUrl === null)).toBe(true);
    expect(stored.slides.every((slide) => slide.imageDeletedAt instanceof Date)).toBe(true);
  });

  test('marks publication failure as error and preserves all Cloudinary images', async () => {
    const post = await createScheduledPost();
    vi.mocked(publishCarousel).mockRejectedValue(new Error('Meta unavailable'));

    const response = await POST(authorizedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 1, published: 0, failed: 1 });
    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { slides: true },
    });
    expect(stored.status).toBe('error');
    expect(stored.errorMessage).toBe('Meta unavailable');
    // Deliberadamente não limpamos o Cloudinary após falha: as imagens precisam
    // continuar disponíveis para inspeção e reprocessamento posterior do post.
    expect(deleteSlideImage).not.toHaveBeenCalled();
    expect(stored.slides.every((slide) => slide.imageUrl !== null)).toBe(true);
    expect(stored.slides.every((slide) => slide.imageDeletedAt === null)).toBe(true);
  });

  test('does not publish scheduled posts whose scheduled time is in the future', async () => {
    await createScheduledPost(new Date(Date.now() + 60_000));

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toEqual({ processed: 0, published: 0, failed: 0 });
    expect(publishCarousel).not.toHaveBeenCalled();
    expect(deleteSlideImage).not.toHaveBeenCalled();
  });

  test('keeps the post published, records cleanup failure and continues other slides', async () => {
    const post = await createScheduledPost();
    vi.mocked(publishCarousel).mockResolvedValue('instagram-post-1');
    vi.mocked(deleteSlideImage)
      .mockRejectedValueOnce(new Error('Cloudinary unavailable'))
      .mockResolvedValueOnce(undefined);

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toEqual({ processed: 1, published: 1, failed: 0 });
    expect(deleteSlideImage).toHaveBeenCalledTimes(2);
    const stored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { slides: { orderBy: { order: 'asc' } } },
    });
    expect(stored.status).toBe('published');
    expect(stored.errorMessage).toContain('Cloudinary cleanup failed for slide');
    expect(stored.slides[0].imageUrl).toBe('https://cdn.test/slide-1.png');
    expect(stored.slides[1].imageUrl).toBeNull();
  });

  test('is idempotent across consecutive runs after the first run publishes the post', async () => {
    await createScheduledPost();
    vi.mocked(publishCarousel).mockResolvedValue('instagram-post-1');

    const firstResponse = await POST(authorizedRequest());
    const secondResponse = await POST(authorizedRequest());

    await expect(firstResponse.json()).resolves.toEqual({ processed: 1, published: 1, failed: 0 });
    await expect(secondResponse.json()).resolves.toEqual({ processed: 0, published: 0, failed: 0 });
    expect(publishCarousel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `npm test -- src/app/api/pipeline/publish/route.test.ts`

Expected: FAIL com `Cannot find module './route'`.

- [ ] **Step 3: Implementar**

`src/app/api/pipeline/publish/route.ts`:

```ts
import { publishCarousel } from '@/lib/instagram/publishCarousel';
import { prisma } from '@/lib/prisma';
import { deleteSlideImage } from '@/lib/storage/cloudinary';

interface PublishResult {
  published: boolean;
}

interface ReadySlide {
  id: string;
  imageUrl: string;
  cloudinaryPublicId: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireAccountId(): string {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
  }
  return accountId;
}

function requireSlides(
  slides: ReadonlyArray<{ id: string; imageUrl: string | null; cloudinaryPublicId: string | null }>
): ReadySlide[] {
  return slides.map((slide) => {
    if (!slide.imageUrl || !slide.cloudinaryPublicId) {
      throw new Error(`Slide ${slide.id} is missing its published image metadata`);
    }
    return {
      id: slide.id,
      imageUrl: slide.imageUrl,
      cloudinaryPublicId: slide.cloudinaryPublicId,
    };
  });
}

async function cleanPublishedSlides(slides: ReadonlyArray<ReadySlide>): Promise<string[]> {
  const failures: string[] = [];
  for (const slide of slides) {
    try {
      await deleteSlideImage(slide.cloudinaryPublicId);
      await prisma.slide.update({
        where: { id: slide.id },
        data: { imageUrl: null, imageDeletedAt: new Date() },
      });
    } catch (error) {
      failures.push(`Cloudinary cleanup failed for slide ${slide.id}: ${errorMessage(error)}`);
    }
  }
  return failures;
}

async function processPost(post: {
  id: string;
  slides: ReadonlyArray<{
    id: string;
    imageUrl: string | null;
    cloudinaryPublicId: string | null;
  }>;
}): Promise<PublishResult> {
  let slides: ReadySlide[];
  let instagramPostId: string;
  try {
    slides = requireSlides(post.slides);
    instagramPostId = await publishCarousel({
      instagramBusinessAccountId: requireAccountId(),
      slides: slides.map(({ imageUrl }) => ({ imageUrl })),
    });
  } catch (error) {
    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'error', errorMessage: errorMessage(error) },
    });
    return { published: false };
  }
  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: 'published',
      publishedAt: new Date(),
      instagramPostId,
      errorMessage: null,
    },
  });
  const cleanupFailures = await cleanPublishedSlides(slides);
  if (cleanupFailures.length > 0) {
    await prisma.post.update({
      where: { id: post.id },
      data: { errorMessage: cleanupFailures.join('; ') },
    });
  }
  return { published: true };
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.PUBLISH_API_TOKEN;
  const authorization = request.headers.get('authorization');
  if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const posts = await prisma.post.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    include: { slides: { orderBy: { order: 'asc' } } },
  });
  const results: PublishResult[] = [];
  for (const post of posts) {
    results.push(await processPost(post));
  }
  const published = results.filter((result) => result.published).length;
  return Response.json({
    processed: results.length,
    published,
    failed: results.length - published,
  });
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `npm test -- src/app/api/pipeline/publish/route.test.ts`

Expected: PASS (6 testes), usando o Neon configurado em `DATABASE_URL`.

Run: `npm install --save-dev @vitest/coverage-v8@^2.1.8`

Expected: `package.json` e `package-lock.json` passam a registrar o provider de cobertura compatível com Vitest 2.

Run: `npm test -- publishCarousel.test.ts src/app/api/pipeline/publish/route.test.ts --coverage`

Expected: PASS (9 testes) e cobertura de pelo menos 80% em `src/lib/instagram/publishCarousel.ts` e `src/app/api/pipeline/publish/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pipeline/publish/route.ts src/app/api/pipeline/publish/route.test.ts package.json package-lock.json
git commit -m "feat: publish scheduled Instagram posts"
```

---

### Task 3: Cron de publicação no GitHub Actions

**Files:**
- Create: `.github/workflows/publish-posts.yml`

**Interfaces:**
- Consumes: secrets do repositório `PUBLISH_API_TOKEN` e `APP_URL`; `POST /api/pipeline/publish` (Task 2)
- Produces: workflow `Publish scheduled Instagram posts`, executado por cron `*/15 * * * *` e por `workflow_dispatch`

- [ ] **Step 1: Confirmar que o workflow ainda não existe**

Run: `Test-Path .github/workflows/publish-posts.yml`

Expected: `False`. Esta task é configuração YAML e, conforme o escopo, não requer teste automatizado.

- [ ] **Step 2: Criar o workflow**

`.github/workflows/publish-posts.yml`:

```yaml
name: Publish scheduled Instagram posts

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Call publishing endpoint
        env:
          PUBLISH_API_TOKEN: ${{ secrets.PUBLISH_API_TOKEN }}
          APP_URL: ${{ secrets.APP_URL }}
        run: |
          curl --fail-with-body --show-error --silent \
            -X POST \
            -H "Authorization: Bearer $PUBLISH_API_TOKEN" \
            "$APP_URL/api/pipeline/publish"
```

- [ ] **Step 3: Validar sintaxe e conteúdo**

Run: `npx --yes prettier@3.6.2 --check .github/workflows/publish-posts.yml`

Expected: `All matched files use Prettier code style!` e exit code 0, confirmando que o YAML é parseável.

Run: `Select-String -Path .github/workflows/publish-posts.yml -Pattern "\*/15 \* \* \* \*", "secrets.PUBLISH_API_TOKEN", "secrets.APP_URL", "/api/pipeline/publish"`

Expected: quatro correspondências, uma para o cron, uma para cada secret e uma para a rota.

- [ ] **Step 4: Rodar a suíte completa**

Run: `npm test`

Expected: todos os testes do projeto passam.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/publish-posts.yml
git commit -m "ci: schedule Instagram post publication"
```

---

## Final Verification

- [ ] Rodar `npm test` e confirmar que toda a suíte passa.
- [ ] Rodar `npm test -- publishCarousel.test.ts src/app/api/pipeline/publish/route.test.ts --coverage` e confirmar cobertura mínima de 80% nos arquivos de lógica deste plano.
- [ ] Rodar `npx tsc --noEmit` e confirmar zero erros de tipos.
- [ ] Rodar `npm run build` e confirmar que o build Next.js termina sem erros.
- [ ] Rodar `git diff --check` e confirmar zero erros de whitespace.
- [ ] Confirmar que `publishCarousel` faz exatamente uma chamada de item por slide, uma de carrossel e uma de publicação, sempre incluindo o corpo de erro da Meta em respostas não-2xx.
- [ ] Confirmar que a rota filtra `scheduledAt <= now()`, ordena slides por `order`, rejeita bearer token inválido e não seleciona novamente posts `published`.
- [ ] Confirmar que somente o caminho de sucesso chama `deleteSlideImage`, zera `imageUrl` e preenche `imageDeletedAt`; o teste de falha documenta por que as imagens são preservadas.
- [ ] Confirmar que o post é persistido como `published` antes da limpeza; uma falha do Cloudinary não pode reclassificar como erro uma publicação que a Meta já concluiu.
- [ ] Confirmar que falhas de limpeza são registradas em `errorMessage`, não impedem a limpeza dos slides seguintes e não interrompem o processamento do lote.
- [ ] Confirmar consistência dos tipos nullable do Prisma: `requireSlides` transforma `string | null` em `string` antes de `publishCarousel` e `deleteSlideImage`.
- [ ] Confirmar que o workflow usa `*/15 * * * *`, `PUBLISH_API_TOKEN` e `APP_URL` dos secrets do repositório.

## Autorrevisão do plano

- [x] Escopo conferido: cliente Graph API, rota protegida, sucesso, falha sem limpeza, idempotência, filtro temporal e workflow a cada 15 minutos estão cobertos por código completo.
- [x] Conteúdo provisório conferido: não há marcadores de trabalho pendente nem instruções que deleguem código a uma task anterior.
- [x] Tipos conferidos entre tasks: a rota faz narrowing dos campos nullable do Prisma e entrega somente strings às assinaturas de `publishCarousel` e `deleteSlideImage`.
- [x] Limite transacional conferido: falha de publicação marca `error` e preserva imagens; limpeza começa somente após o post ser persistido como `published`.
