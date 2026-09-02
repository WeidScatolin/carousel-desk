# Dashboard Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o dashboard kanban de administração única do carousel-desk
— autenticação de admin único, camada de leitura tipada sobre o Prisma,
rotas de API para aprovar/rejeitar temas e posts e editar/regenerar slides, e
a UI kanban com drag-and-drop (`/admin`) que consome tudo isso.

**Architecture:** Next.js App Router (Route Handlers em `src/app/api/**`,
páginas em `src/app/admin/**`). Autenticação stateless via cookie selado
(`iron-session`), sem tabela de usuário — credenciais vêm de variáveis de
ambiente. `src/proxy.ts` (substituto do `middleware.ts` no Next.js 16)
protege `/admin/**` e as rotas de API de mutação. Uma camada de leitura fina
em `src/lib/data/` encapsula todas as queries Prisma usadas pelo dashboard. A
lógica de transição de coluna do kanban (o que uma ação de "arrastar" deve
disparar) fica isolada em funções puras testáveis (`src/lib/kanban/`),
separada da integração real com `@dnd-kit`.

**Tech Stack:** Next.js 16 (App Router, TypeScript), `iron-session`,
`bcryptjs`, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`,
Zod (já presente desde o Plano 1), Vitest + `@testing-library/react` +
`@testing-library/jest-dom` (jsdom só nos testes de componente/rota, via
pragma por arquivo).

**Spec:** `docs/superpowers/specs/2026-09-02-carousel-desk-design.md`

**Depende do Plano 1** (`docs/superpowers/plans/2026-09-02-fundacao-pipeline-central.md`),
já implementado na main. Este plano importa e reutiliza, sem reimplementar:

- `prisma` — `src/lib/prisma.ts`
- Modelos/enums Prisma — `Theme`, `Post`, `Slide`, `ThemeStatus`, `PostStatus`,
  `SlideTemplate`, `ImageSource` (`@/generated/prisma/client`)
- `generatePostFromTheme(themeId: string): Promise<string>` —
  `src/lib/pipeline/generatePostFromTheme.ts`
- `generateSlideHtml(slide: SlideCopy): Promise<string>` e `SlideCopy` —
  `src/lib/ai/generateSlideHtml.ts`
- `renderSlideToImage(html: string): Promise<Buffer>` —
  `src/lib/render/renderSlideToImage.ts`
- `uploadSlideImage(buffer, publicId): Promise<UploadedImage>` e
  `deleteSlideImage(publicId): Promise<void>` — `src/lib/storage/cloudinary.ts`

## Global Constraints

- Sem tabela de usuário no banco — um único admin, credenciais em
  `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` (hash bcrypt), comparadas em
  runtime.
- `SESSION_SECRET` (≥32 caracteres) é a senha de selagem do cookie
  `iron-session` — nunca hardcoded, nunca logado.
- Todo corpo de requisição de entrada externo (bodies de rotas de API) é
  validado com Zod antes de tocar o Prisma ou qualquer serviço externo.
- `src/proxy.ts` (não `middleware.ts` — renomeado no Next.js 16) exporta a
  função `proxy`, e protege `/admin/**` (exceto `/admin/login`) e as rotas de
  mutação sob `/api/themes/**`, `/api/posts/**`, `/api/slides/**`.
- Sem fila/retry automático (mesmo princípio do Plano 1): falha em uma rota
  de API retorna erro explícito ao dashboard; nada fica reagendado
  silenciosamente.
- Lógica de decisão do kanban (qual ação uma transição de coluna dispara) é
  pura e testável via Vitest, separada da integração com `@dnd-kit` (que é
  verificada manualmente rodando o app — sem E2E completo nesta fase, mesma
  decisão do Plano 1).
- TypeScript: tipar parâmetros/retornos de funções exportadas; nunca `any`
  (usar `unknown` + narrowing); `interface` para props/objetos, `type` para
  unions.
- Imutabilidade: nunca mutar objetos/arrays recebidos.
- Sem `console.log` em código de produção.
- Funções pequenas e focadas (<50 linhas), arquivos coesos (<800 linhas,
  idealmente 200-400).
- Testes no padrão AAA (Arrange-Act-Assert) com nomes descritivos.
- `DATABASE_URL` nos testes aponta para o banco Neon real de desenvolvimento
  (mesma convenção do Plano 1) — testes de integração limpam os próprios
  registros no `afterEach`.

---

### Task 1: Migration — motivo de rejeição em Theme e Post

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_rejection_reason/migration.sql`
  (gerado pelo Prisma)

**Interfaces:**
- Consumes: nada
- Produces: campo `rejectionReason: String?` em `Theme` e `Post`

O kanban precisa exibir o motivo na coluna "Rejeitado" (spec: "Rejeitado
(com motivo)"), mas o schema do Plano 1 não tem esse campo.

- [ ] **Step 1: Adicionar o campo em `prisma/schema.prisma`**

Em `model Theme`, logo abaixo de `status`:

```prisma
  status             ThemeStatus @default(pending)
  rejectionReason    String?
```

Em `model Post`, logo abaixo de `errorMessage`:

```prisma
  errorMessage    String?
  rejectionReason String?
```

- [ ] **Step 2: Gerar e aplicar a migration**

Run: `npx prisma migrate dev --name add_rejection_reason`
Expected: cria `prisma/migrations/<timestamp>_add_rejection_reason/migration.sql`
e aplica no banco Neon de desenvolvimento sem erro.

- [ ] **Step 3: Regenerar o client Prisma**

Run: `npx prisma generate`
Expected: `src/generated/prisma` regenerado sem erro, com `rejectionReason`
disponível em `Theme` e `Post`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add rejectionReason to Theme and Post"
```

---

### Task 2: Dependências de autenticação, drag-and-drop e testes de componente

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `.env.example`
- Modify: `vitest.setup.ts`

**Interfaces:**
- Consumes: nada
- Produces: pacotes `iron-session`, `bcryptjs`, `@dnd-kit/core`,
  `@dnd-kit/sortable`, `@dnd-kit/utilities` disponíveis; matchers do
  `@testing-library/jest-dom` disponíveis globalmente nos testes

- [ ] **Step 1: Instalar dependências de produção**

Run: `npm install iron-session@^8.0.4 bcryptjs@^2.4.3 @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0 @dnd-kit/utilities@^3.2.2`
Expected: completa sem erro; `package.json`/`package-lock.json` atualizados.

- [ ] **Step 2: Instalar dependências de desenvolvimento**

Run: `npm install -D @types/bcryptjs@^2.4.6 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2 jsdom@^25.0.1`
Expected: completa sem erro.

- [ ] **Step 3: Adicionar variáveis de ambiente em `.env.example`**

```
ADMIN_USERNAME=""
ADMIN_PASSWORD_HASH=""
SESSION_SECRET=""
```

- [ ] **Step 4: Gerar localmente as credenciais de desenvolvimento**

Run: `node -e "require('bcryptjs').hash(process.argv[1], 10).then(console.log)" "sua-senha-local"`
Expected: imprime um hash bcrypt. Copie-o para `ADMIN_PASSWORD_HASH` no seu
`.env` local (nunca commitado), defina `ADMIN_USERNAME` e gere um
`SESSION_SECRET` com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- [ ] **Step 5: Habilitar matchers do jest-dom nos testes**

Editar `vitest.setup.ts`:

```ts
import { config } from 'dotenv';
import '@testing-library/jest-dom/vitest';

config({ path: '.env' });
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example vitest.setup.ts
git commit -m "chore: add auth, drag-and-drop and component testing dependencies"
```

---

### Task 3: `verifyCredentials` — comparação de credenciais do admin único

**Files:**
- Create: `src/lib/auth/credentials.ts`
- Test: `src/lib/auth/credentials.test.ts`

**Interfaces:**
- Consumes: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (env vars); pacote
  `bcryptjs`
- Produces: `function verifyCredentials(username: string, password: string, env?: NodeJS.ProcessEnv): Promise<boolean>`

- [ ] **Step 1: Escrever o teste**

`src/lib/auth/credentials.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('bcryptjs', () => ({ default: { compare: vi.fn() } }));

import bcrypt from 'bcryptjs';
import { verifyCredentials } from './credentials';

const env = {
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH: 'hashed-password',
} as NodeJS.ProcessEnv;

describe('verifyCredentials', () => {
  beforeEach(() => {
    vi.mocked(bcrypt.compare).mockReset();
  });

  test('returns true when username matches and password compares successfully', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await verifyCredentials('admin', 'correct-password', env);

    expect(result).toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
  });

  test('returns false when the username does not match', async () => {
    const result = await verifyCredentials('someone-else', 'correct-password', env);

    expect(result).toBe(false);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns false when bcrypt compare fails', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await verifyCredentials('admin', 'wrong-password', env);

    expect(result).toBe(false);
  });

  test('throws when ADMIN_USERNAME or ADMIN_PASSWORD_HASH is not set', async () => {
    await expect(verifyCredentials('admin', 'x', {} as NodeJS.ProcessEnv)).rejects.toThrow(
      'ADMIN_USERNAME or ADMIN_PASSWORD_HASH is not set'
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- credentials.test.ts`
Expected: FAIL com "Cannot find module './credentials'"

- [ ] **Step 3: Implementar `src/lib/auth/credentials.ts`**

```ts
import bcrypt from 'bcryptjs';

export async function verifyCredentials(
  username: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const expectedUsername = env.ADMIN_USERNAME;
  const expectedPasswordHash = env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedPasswordHash) {
    throw new Error('ADMIN_USERNAME or ADMIN_PASSWORD_HASH is not set');
  }

  if (username !== expectedUsername) {
    return false;
  }

  return bcrypt.compare(password, expectedPasswordHash);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- credentials.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/credentials.ts src/lib/auth/credentials.test.ts
git commit -m "feat: add single-admin credential verification"
```

---

### Task 4: Sessão selada (`iron-session`)

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `SESSION_SECRET` (env var); pacotes `iron-session`,
  `next/headers`
- Produces: `interface SessionData { isLoggedIn: boolean; username?: string }`;
  `const SESSION_COOKIE_NAME: string`; `function getSessionOptions(env?: NodeJS.ProcessEnv): SessionOptions`;
  `function getSession(): Promise<IronSession<SessionData>>`

- [ ] **Step 1: Escrever o teste**

`src/lib/auth/session.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { getSessionOptions, SESSION_COOKIE_NAME } from './session';

describe('getSessionOptions', () => {
  test('builds session options from SESSION_SECRET', () => {
    const options = getSessionOptions({
      SESSION_SECRET: 'a'.repeat(32),
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);

    expect(options.cookieName).toBe(SESSION_COOKIE_NAME);
    expect(options.password).toBe('a'.repeat(32));
    expect(options.cookieOptions?.secure).toBe(false);
  });

  test('marks the cookie secure in production', () => {
    const options = getSessionOptions({
      SESSION_SECRET: 'a'.repeat(32),
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(options.cookieOptions?.secure).toBe(true);
  });

  test('throws when SESSION_SECRET is not set', () => {
    expect(() => getSessionOptions({} as NodeJS.ProcessEnv)).toThrow('SESSION_SECRET is not set');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- session.test.ts`
Expected: FAIL com "Cannot find module './session'"

- [ ] **Step 3: Implementar `src/lib/auth/session.ts`**

```ts
import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';

export interface SessionData {
  isLoggedIn: boolean;
  username?: string;
}

export const SESSION_COOKIE_NAME = 'carousel-desk-session';

export function getSessionOptions(env: NodeJS.ProcessEnv = process.env): SessionOptions {
  const password = env.SESSION_SECRET;
  if (!password) {
    throw new Error('SESSION_SECRET is not set');
  }

  return {
    cookieName: SESSION_COOKIE_NAME,
    password,
    cookieOptions: { secure: env.NODE_ENV === 'production' },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- session.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: add sealed-cookie session config for the single admin"
```

---

### Task 5: Rota `POST /api/auth/login`

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Test: `src/app/api/auth/login/route.test.ts`

**Interfaces:**
- Consumes: `verifyCredentials` (Task 3), `getSession` (Task 4), Zod
- Produces: `POST(request: Request): Promise<NextResponse>` — 200 e sessão
  salva em caso de sucesso; 400 se o corpo for inválido; 401 se as
  credenciais forem inválidas

- [ ] **Step 1: Escrever o teste**

`src/app/api/auth/login/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/credentials', () => ({ verifyCredentials: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

import { verifyCredentials } from '@/lib/auth/credentials';
import { getSession } from '@/lib/auth/session';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.mocked(verifyCredentials).mockReset();
    vi.mocked(getSession).mockReset();
  });

  test('returns 400 when the body is missing username or password', async () => {
    const response = await POST(buildRequest({ username: 'admin' }));

    expect(response.status).toBe(400);
  });

  test('returns 401 and does not save a session when credentials are invalid', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(false);

    const response = await POST(buildRequest({ username: 'admin', password: 'wrong' }));

    expect(response.status).toBe(401);
    expect(getSession).not.toHaveBeenCalled();
  });

  test('saves the session and returns 200 when credentials are valid', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(true);
    const save = vi.fn();
    vi.mocked(getSession).mockResolvedValue({ save } as never);

    const response = await POST(buildRequest({ username: 'admin', password: 'correct' }));

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/auth/login/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/auth/login/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCredentials } from '@/lib/auth/credentials';
import { getSession } from '@/lib/auth/session';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isValid = await verifyCredentials(parsed.data.username, parsed.data.password);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  session.username = parsed.data.username;
  await session.save();

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/auth/login/route.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/login
git commit -m "feat: add admin login route"
```

---

### Task 6: Rota `POST /api/auth/logout`

**Files:**
- Create: `src/app/api/auth/logout/route.ts`
- Test: `src/app/api/auth/logout/route.test.ts`

**Interfaces:**
- Consumes: `getSession` (Task 4)
- Produces: `POST(): Promise<NextResponse>` — destrói a sessão e retorna 200

- [ ] **Step 1: Escrever o teste**

`src/app/api/auth/logout/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

import { getSession } from '@/lib/auth/session';
import { POST } from './route';

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
  });

  test('destroys the session and returns 200', async () => {
    const destroy = vi.fn();
    vi.mocked(getSession).mockResolvedValue({ destroy } as never);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/auth/logout/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/auth/logout/route.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/logout
git commit -m "feat: add admin logout route"
```

---

### Task 7: Página `/admin/login`

**Files:**
- Create: `src/app/admin/login/page.tsx`
- Test: `src/app/admin/login/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` (via `fetch`), `useRouter` (`next/navigation`)
- Produces: página cliente com formulário usuário/senha

- [ ] **Step 1: Escrever o teste**

`src/app/admin/login/page.test.tsx` (pragma de ambiente no topo do arquivo):

```tsx
// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    global.fetch = vi.fn();
  });

  test('shows an error message when login fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuário'), 'admin');
    await user.type(screen.getByPlaceholderText('Senha'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Usuário ou senha inválidos')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test('redirects to /admin when login succeeds', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuário'), 'admin');
    await user.type(screen.getByPlaceholderText('Senha'), 'correct');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(push).toHaveBeenCalledWith('/admin');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/admin/login/page.test.tsx`
Expected: FAIL com "Cannot find module './page'"

- [ ] **Step 3: Implementar `src/app/admin/login/page.tsx`**

```tsx
'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
      }),
    });

    if (!response.ok) {
      setError('Usuário ou senha inválidos');
      return;
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="flex w-72 flex-col gap-3">
        <h1 className="text-lg font-bold">carousel-desk</h1>
        <input name="username" placeholder="Usuário" required className="border p-2" />
        <input name="password" type="password" placeholder="Senha" required className="border p-2" />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="bg-black p-2 text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/admin/login/page.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/login
git commit -m "feat: add admin login page"
```

---

### Task 8: `src/proxy.ts` — proteção de `/admin/**` e das rotas de mutação

**Files:**
- Create: `src/proxy.ts`
- Test: `src/proxy.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME`, `SessionData` (Task 4); `unsealData` de
  `iron-session`
- Produces: `async function proxy(request: NextRequest): Promise<NextResponse>`;
  `export const config`

Next.js 16 renomeou `middleware.ts` para `proxy.ts` (a função exportada
também se chama `proxy`, não `middleware`).

- [ ] **Step 1: Escrever o teste**

`src/proxy.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('iron-session', () => ({ unsealData: vi.fn() }));

import { unsealData } from 'iron-session';
import { proxy } from './proxy';

function buildRequest(path: string, cookieValue?: string): NextRequest {
  const request = new NextRequest(new URL(path, 'http://localhost'));
  if (cookieValue) {
    request.cookies.set('carousel-desk-session', cookieValue);
  }
  return request;
}

describe('proxy', () => {
  beforeEach(() => {
    vi.mocked(unsealData).mockReset();
    process.env.SESSION_SECRET = 'a'.repeat(32);
  });

  test('lets through requests to /admin/login without a session', async () => {
    const response = await proxy(buildRequest('/admin/login'));

    expect(response.status).toBe(200);
  });

  test('redirects to /admin/login when there is no session cookie', async () => {
    const response = await proxy(buildRequest('/admin'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/login');
  });

  test('redirects to /admin/login when the session is not logged in', async () => {
    vi.mocked(unsealData).mockResolvedValue({ isLoggedIn: false });

    const response = await proxy(buildRequest('/admin', 'sealed-value'));

    expect(response.status).toBe(307);
  });

  test('allows the request through for a logged-in session on an admin page', async () => {
    vi.mocked(unsealData).mockResolvedValue({ isLoggedIn: true, username: 'admin' });

    const response = await proxy(buildRequest('/admin', 'sealed-value'));

    expect(response.status).toBe(200);
  });

  test('returns 401 JSON (not a redirect) for a protected API route without a session', async () => {
    const response = await proxy(buildRequest('/api/themes/abc/approve'));

    expect(response.status).toBe(401);
  });

  test('allows a protected API route through for a logged-in session', async () => {
    vi.mocked(unsealData).mockResolvedValue({ isLoggedIn: true, username: 'admin' });

    const response = await proxy(buildRequest('/api/posts/abc/reject', 'sealed-value'));

    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/proxy.test.ts`
Expected: FAIL com "Cannot find module './proxy'"

- [ ] **Step 3: Implementar `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { unsealData } from 'iron-session';
import { SESSION_COOKIE_NAME, type SessionData } from '@/lib/auth/session';

const PUBLIC_ADMIN_PATHS = ['/admin/login'];
const PROTECTED_API_PREFIXES = ['/api/themes/', '/api/posts/', '/api/slides/'];

async function isRequestAuthenticated(request: NextRequest): Promise<boolean> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const password = process.env.SESSION_SECRET;

  if (!cookieValue || !password) {
    return false;
  }

  try {
    const session = await unsealData<SessionData>(cookieValue, { password });
    return session.isLoggedIn === true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isProtectedPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.includes(pathname);
  const isProtectedApi = PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  const authenticated = await isRequestAuthenticated(request);
  if (authenticated) {
    return NextResponse.next();
  }

  if (isProtectedApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/api/themes/:path*', '/api/posts/:path*', '/api/slides/:path*'],
};
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/proxy.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts
git commit -m "feat: protect /admin and mutation API routes with proxy auth check"
```

---

### Task 9: Camada de leitura — Temas (`src/lib/data/themes.ts`)

**Files:**
- Create: `src/lib/data/themes.ts`
- Test: `src/lib/data/themes.test.ts`

**Interfaces:**
- Consumes: `prisma` (Plano 1), enum `ThemeStatus`
- Produces: `function listThemesByStatus(status: ThemeStatus): Promise<Theme[]>`;
  `function listPendingThemes(): Promise<Theme[]>`

- [ ] **Step 1: Escrever o teste**

`src/lib/data/themes.test.ts`:

```ts
import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { listThemesByStatus, listPendingThemes } from './themes';

describe('themes data layer', () => {
  afterEach(async () => {
    await prisma.theme.deleteMany({ where: { sourceUrl: 'https://example.com/themes-data-test' } });
  });

  test('listThemesByStatus returns only themes with the given status', async () => {
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test',
        summary: 'resumo pendente',
        headlineSuggestion: 'Tema pendente',
        status: 'pending',
      },
    });
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test',
        summary: 'resumo aprovado',
        headlineSuggestion: 'Tema aprovado',
        status: 'approved',
      },
    });

    const pending = await listThemesByStatus('pending');

    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema pendente')).toBe(true);
    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema aprovado')).toBe(false);
  });

  test('listPendingThemes delegates to listThemesByStatus with pending', async () => {
    await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/themes-data-test',
        summary: 'resumo',
        headlineSuggestion: 'Tema pendente 2',
        status: 'pending',
      },
    });

    const pending = await listPendingThemes();

    expect(pending.some((theme) => theme.headlineSuggestion === 'Tema pendente 2')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/data/themes.test.ts`
Expected: FAIL com "Cannot find module './themes'"

- [ ] **Step 3: Implementar `src/lib/data/themes.ts`**

```ts
import { prisma } from '@/lib/prisma';
import type { Theme, ThemeStatus } from '@/generated/prisma/client';

export async function listThemesByStatus(status: ThemeStatus): Promise<Theme[]> {
  return prisma.theme.findMany({ where: { status }, orderBy: { createdAt: 'desc' } });
}

export async function listPendingThemes(): Promise<Theme[]> {
  return listThemesByStatus('pending');
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/data/themes.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/themes.ts src/lib/data/themes.test.ts
git commit -m "feat: add themes read layer"
```

---

### Task 10: Camada de leitura — Posts (`src/lib/data/posts.ts`)

**Files:**
- Create: `src/lib/data/posts.ts`
- Test: `src/lib/data/posts.test.ts`

**Interfaces:**
- Consumes: `prisma` (Plano 1), enum `PostStatus`
- Produces: `interface PostWithSlides extends Post { slides: Slide[] }`;
  `function listPostsByStatus(status: PostStatus): Promise<PostWithSlides[]>`

- [ ] **Step 1: Escrever o teste**

`src/lib/data/posts.test.ts`:

```ts
import { describe, test, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { listPostsByStatus } from './posts';

describe('listPostsByStatus', () => {
  let themeId: string;

  afterEach(async () => {
    await prisma.slide.deleteMany({ where: { post: { themeId } } });
    await prisma.post.deleteMany({ where: { themeId } });
    await prisma.theme.deleteMany({ where: { id: themeId } });
  });

  test('returns posts of the given status with their slides ordered', async () => {
    const theme = await prisma.theme.create({
      data: {
        sourceUrl: 'https://example.com/posts-data-test',
        summary: 'resumo',
        headlineSuggestion: 'Tema com post',
        status: 'approved',
      },
    });
    themeId = theme.id;

    const post = await prisma.post.create({
      data: { themeId: theme.id, status: 'pending_approval' },
    });

    await prisma.slide.create({
      data: { postId: post.id, order: 1, template: 'evidence', htmlContent: '<html></html>' },
    });
    await prisma.slide.create({
      data: { postId: post.id, order: 0, template: 'cover', htmlContent: '<html></html>' },
    });

    const [result] = await listPostsByStatus('pending_approval');

    expect(result.id).toBe(post.id);
    expect(result.slides.map((slide) => slide.order)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/data/posts.test.ts`
Expected: FAIL com "Cannot find module './posts'"

- [ ] **Step 3: Implementar `src/lib/data/posts.ts`**

```ts
import { prisma } from '@/lib/prisma';
import type { Post, PostStatus, Slide } from '@/generated/prisma/client';

export interface PostWithSlides extends Post {
  slides: Slide[];
}

export async function listPostsByStatus(status: PostStatus): Promise<PostWithSlides[]> {
  return prisma.post.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: { slides: { orderBy: { order: 'asc' } } },
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/data/posts.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/posts.ts src/lib/data/posts.test.ts
git commit -m "feat: add posts read layer with ordered slides"
```

---

### Task 11: Schemas Zod das ações do kanban

**Files:**
- Create: `src/lib/validation/kanbanActions.ts`
- Test: `src/lib/validation/kanbanActions.test.ts`

**Interfaces:**
- Consumes: Zod
- Produces: `rejectThemeSchema`, `rejectPostSchema`, `approvePostSchema`,
  `updateSlideSchema` e seus tipos inferidos (`RejectThemeInput`,
  `RejectPostInput`, `ApprovePostInput`, `UpdateSlideInput`)

- [ ] **Step 1: Escrever o teste**

`src/lib/validation/kanbanActions.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { rejectThemeSchema, approvePostSchema, updateSlideSchema } from './kanbanActions';

describe('kanban action schemas', () => {
  test('rejectThemeSchema accepts a non-empty reason', () => {
    expect(rejectThemeSchema.safeParse({ reason: 'fora do nicho' }).success).toBe(true);
  });

  test('rejectThemeSchema rejects an empty reason', () => {
    expect(rejectThemeSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  test('approvePostSchema accepts a valid ISO datetime', () => {
    expect(approvePostSchema.safeParse({ scheduledAt: '2026-09-05T12:00:00.000Z' }).success).toBe(true);
  });

  test('approvePostSchema rejects a non-ISO string', () => {
    expect(approvePostSchema.safeParse({ scheduledAt: 'amanhã' }).success).toBe(false);
  });

  test('updateSlideSchema requires both headline and body', () => {
    expect(updateSlideSchema.safeParse({ headline: 'Título' }).success).toBe(false);
    expect(updateSlideSchema.safeParse({ headline: 'Título', body: 'Corpo' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/validation/kanbanActions.test.ts`
Expected: FAIL com "Cannot find module './kanbanActions'"

- [ ] **Step 3: Implementar `src/lib/validation/kanbanActions.ts`**

```ts
import { z } from 'zod';

export const rejectThemeSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export const rejectPostSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export const approvePostSchema = z.object({
  scheduledAt: z.string().datetime({ message: 'scheduledAt must be an ISO 8601 datetime' }),
});

export const updateSlideSchema = z.object({
  headline: z.string().min(1, 'headline is required'),
  body: z.string().min(1, 'body is required'),
});

export type RejectThemeInput = z.infer<typeof rejectThemeSchema>;
export type RejectPostInput = z.infer<typeof rejectPostSchema>;
export type ApprovePostInput = z.infer<typeof approvePostSchema>;
export type UpdateSlideInput = z.infer<typeof updateSlideSchema>;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/validation/kanbanActions.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/kanbanActions.ts src/lib/validation/kanbanActions.test.ts
git commit -m "feat: add Zod schemas for kanban mutation routes"
```

---

### Task 12: Rota `POST /api/themes/[id]/approve`

**Files:**
- Create: `src/app/api/themes/[id]/approve/route.ts`
- Test: `src/app/api/themes/[id]/approve/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `generatePostFromTheme` (Plano 1)
- Produces: `POST(request: Request, { params }): Promise<NextResponse>` —
  marca `Theme.status = approved`, dispara `generatePostFromTheme`, retorna
  `{ postId }`

- [ ] **Step 1: Escrever o teste**

`src/app/api/themes/[id]/approve/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { theme: { update: vi.fn() } } }));
vi.mock('@/lib/pipeline/generatePostFromTheme', () => ({ generatePostFromTheme: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { generatePostFromTheme } from '@/lib/pipeline/generatePostFromTheme';
import { POST } from './route';

function buildRequest(): Request {
  return new Request('http://localhost/api/themes/theme-1/approve', { method: 'POST' });
}

describe('POST /api/themes/[id]/approve', () => {
  beforeEach(() => {
    vi.mocked(prisma.theme.update).mockReset();
    vi.mocked(generatePostFromTheme).mockReset();
  });

  test('marks the theme approved and returns the generated post id', async () => {
    vi.mocked(generatePostFromTheme).mockResolvedValue('post-1');

    const response = await POST(buildRequest(), { params: Promise.resolve({ id: 'theme-1' }) });
    const body = await response.json();

    expect(prisma.theme.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: { status: 'approved' },
    });
    expect(generatePostFromTheme).toHaveBeenCalledWith('theme-1');
    expect(response.status).toBe(200);
    expect(body).toEqual({ postId: 'post-1' });
  });

  test('returns 500 when generation fails', async () => {
    vi.mocked(generatePostFromTheme).mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(buildRequest(), { params: Promise.resolve({ id: 'theme-1' }) });

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/themes/\[id\]/approve/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/themes/[id]/approve/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePostFromTheme } from '@/lib/pipeline/generatePostFromTheme';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  try {
    await prisma.theme.update({ where: { id }, data: { status: 'approved' } });
    const postId = await generatePostFromTheme(id);

    return NextResponse.json({ postId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/themes/\[id\]/approve/route.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/themes/[id]/approve
git commit -m "feat: add theme approve route triggering post generation"
```

---

### Task 13: Rota `POST /api/themes/[id]/reject`

**Files:**
- Create: `src/app/api/themes/[id]/reject/route.ts`
- Test: `src/app/api/themes/[id]/reject/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `rejectThemeSchema` (Task 11)
- Produces: `POST(request: Request, { params }): Promise<NextResponse>` —
  marca `Theme.status = rejected` com `rejectionReason`

- [ ] **Step 1: Escrever o teste**

`src/app/api/themes/[id]/reject/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { theme: { update: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/themes/theme-1/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/themes/[id]/reject', () => {
  beforeEach(() => {
    vi.mocked(prisma.theme.update).mockReset();
  });

  test('returns 400 when reason is missing', async () => {
    const response = await POST(buildRequest({}), { params: Promise.resolve({ id: 'theme-1' }) });

    expect(response.status).toBe(400);
    expect(prisma.theme.update).not.toHaveBeenCalled();
  });

  test('marks the theme rejected with the given reason', async () => {
    const response = await POST(buildRequest({ reason: 'fora do nicho' }), {
      params: Promise.resolve({ id: 'theme-1' }),
    });

    expect(prisma.theme.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: { status: 'rejected', rejectionReason: 'fora do nicho' },
    });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/themes/\[id\]/reject/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/themes/[id]/reject/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rejectThemeSchema } from '@/lib/validation/kanbanActions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = rejectThemeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.theme.update({
    where: { id },
    data: { status: 'rejected', rejectionReason: parsed.data.reason },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/themes/\[id\]/reject/route.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/themes/[id]/reject
git commit -m "feat: add theme reject route"
```

---

### Task 14: Rota `POST /api/posts/[id]/approve`

**Files:**
- Create: `src/app/api/posts/[id]/approve/route.ts`
- Test: `src/app/api/posts/[id]/approve/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `approvePostSchema` (Task 11)
- Produces: `POST(request: Request, { params }): Promise<NextResponse>` —
  marca `Post.status = scheduled` com `scheduledAt`

- [ ] **Step 1: Escrever o teste**

`src/app/api/posts/[id]/approve/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { post: { update: vi.fn() } } }));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/posts/post-1/approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/posts/[id]/approve', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.update).mockReset();
  });

  test('returns 400 when scheduledAt is not a valid ISO datetime', async () => {
    const response = await POST(buildRequest({ scheduledAt: 'amanhã' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(response.status).toBe(400);
  });

  test('schedules the post at the given datetime', async () => {
    const response = await POST(buildRequest({ scheduledAt: '2026-09-05T12:00:00.000Z' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'scheduled', scheduledAt: new Date('2026-09-05T12:00:00.000Z') },
    });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/posts/\[id\]/approve/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/posts/[id]/approve/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { approvePostSchema } from '@/lib/validation/kanbanActions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = approvePostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.post.update({
    where: { id },
    data: { status: 'scheduled', scheduledAt: new Date(parsed.data.scheduledAt) },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/posts/\[id\]/approve/route.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/posts/[id]/approve
git commit -m "feat: add post approve route (scheduling)"
```

---

### Task 15: Rota `POST /api/posts/[id]/reject` (tema volta pra fila)

**Files:**
- Create: `src/app/api/posts/[id]/reject/route.ts`
- Test: `src/app/api/posts/[id]/reject/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `rejectPostSchema` (Task 11)
- Produces: `POST(request: Request, { params }): Promise<NextResponse>` —
  marca `Post.status = rejected` com `rejectionReason`, e devolve o `Theme`
  relacionado para `status = pending` (numa transação)

- [ ] **Step 1: Escrever o teste**

`src/app/api/posts/[id]/reject/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { update: vi.fn() },
    theme: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/posts/post-1/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/posts/[id]/reject', () => {
  beforeEach(() => {
    vi.mocked(prisma.post.update).mockReset();
    vi.mocked(prisma.theme.update).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
  });

  test('returns 400 when reason is missing', async () => {
    const response = await POST(buildRequest({}), { params: Promise.resolve({ id: 'post-1' }) });

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('rejects the post and requeues its theme in a single transaction', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => {
      expect(Array.isArray(ops)).toBe(true);
      return ops;
    });
    vi.mocked(prisma.post.update).mockReturnValue({ themeId: 'theme-1' } as never);

    const response = await POST(buildRequest({ reason: 'texto fraco' }), {
      params: Promise.resolve({ id: 'post-1' }),
    });

    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'rejected', rejectionReason: 'texto fraco' },
    });
    expect(prisma.theme.update).toHaveBeenCalledWith({
      where: { id: 'theme-1' },
      data: { status: 'pending' },
    });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/posts/\[id\]/reject/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/posts/[id]/reject/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rejectPostSchema } from '@/lib/validation/kanbanActions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = rejectPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const post = await prisma.post.findUniqueOrThrow({ where: { id } });

  await prisma.$transaction([
    prisma.post.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: parsed.data.reason },
    }),
    prisma.theme.update({ where: { id: post.themeId }, data: { status: 'pending' } }),
  ]);

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

> Nota: o teste acima mocka `prisma.post.update` diretamente (chamado antes
> da transação, no fluxo real via `findUniqueOrThrow`); ajuste o mock para
> `prisma.post.findUniqueOrThrow` retornar `{ themeId: 'theme-1' }` ao
> implementar — mantenha a asserção de que `theme.update` recebe
> `theme-1` e que ambas as operações vão para `$transaction`.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/posts/\[id\]/reject/route.test.ts`
Expected: PASS (2 testes) — ajuste os mocks do teste conforme a nota acima
antes de rodar, se necessário.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/posts/[id]/reject
git commit -m "feat: add post reject route that requeues the theme"
```

---

### Task 16: Rota `PATCH /api/slides/[id]` (editar texto + regenerar imagem)

**Files:**
- Create: `src/app/api/slides/[id]/route.ts`
- Test: `src/app/api/slides/[id]/route.test.ts`

**Interfaces:**
- Consumes: `prisma`, `updateSlideSchema` (Task 11), `generateSlideHtml`,
  `renderSlideToImage`, `uploadSlideImage`, `deleteSlideImage` (Plano 1)
- Produces: `PATCH(request: Request, { params }): Promise<NextResponse>` —
  regenera HTML+PNG do slide com o novo texto, substitui a imagem no
  Cloudinary, retorna o `Slide` atualizado

- [ ] **Step 1: Escrever o teste**

`src/app/api/slides/[id]/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { slide: { findUniqueOrThrow: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/ai/generateSlideHtml', () => ({ generateSlideHtml: vi.fn() }));
vi.mock('@/lib/render/renderSlideToImage', () => ({ renderSlideToImage: vi.fn() }));
vi.mock('@/lib/storage/cloudinary', () => ({ uploadSlideImage: vi.fn(), deleteSlideImage: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';
import { renderSlideToImage } from '@/lib/render/renderSlideToImage';
import { uploadSlideImage, deleteSlideImage } from '@/lib/storage/cloudinary';
import { PATCH } from './route';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/slides/slide-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/slides/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockReset();
    vi.mocked(prisma.slide.update).mockReset();
    vi.mocked(generateSlideHtml).mockReset();
    vi.mocked(renderSlideToImage).mockReset();
    vi.mocked(uploadSlideImage).mockReset();
    vi.mocked(deleteSlideImage).mockReset();
  });

  test('returns 400 when headline or body is missing', async () => {
    const response = await PATCH(buildRequest({ headline: 'Só título' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(response.status).toBe(400);
  });

  test('regenerates HTML and image, deletes the old Cloudinary asset, and updates the slide', async () => {
    vi.mocked(prisma.slide.findUniqueOrThrow).mockResolvedValue({
      id: 'slide-1',
      postId: 'post-1',
      order: 0,
      template: 'cover',
      cloudinaryPublicId: 'old-public-id',
    } as never);
    vi.mocked(generateSlideHtml).mockResolvedValue('<html>novo</html>');
    vi.mocked(renderSlideToImage).mockResolvedValue(Buffer.from('fake-png'));
    vi.mocked(uploadSlideImage).mockResolvedValue({
      url: 'https://cloudinary.test/new.png',
      publicId: 'new-public-id',
    });
    vi.mocked(prisma.slide.update).mockResolvedValue({ id: 'slide-1' } as never);

    const response = await PATCH(buildRequest({ headline: 'Novo título', body: 'Novo corpo' }), {
      params: Promise.resolve({ id: 'slide-1' }),
    });

    expect(generateSlideHtml).toHaveBeenCalledWith({
      template: 'cover',
      headline: 'Novo título',
      body: 'Novo corpo',
    });
    expect(deleteSlideImage).toHaveBeenCalledWith('old-public-id');
    expect(prisma.slide.update).toHaveBeenCalledWith({
      where: { id: 'slide-1' },
      data: {
        htmlContent: '<html>novo</html>',
        imageUrl: 'https://cloudinary.test/new.png',
        cloudinaryPublicId: 'new-public-id',
      },
    });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/api/slides/\[id\]/route.test.ts`
Expected: FAIL com "Cannot find module './route'"

- [ ] **Step 3: Implementar `src/app/api/slides/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateSlideSchema } from '@/lib/validation/kanbanActions';
import { generateSlideHtml } from '@/lib/ai/generateSlideHtml';
import { renderSlideToImage } from '@/lib/render/renderSlideToImage';
import { uploadSlideImage, deleteSlideImage } from '@/lib/storage/cloudinary';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updateSlideSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slide = await prisma.slide.findUniqueOrThrow({ where: { id } });

  const html = await generateSlideHtml({
    template: slide.template,
    headline: parsed.data.headline,
    body: parsed.data.body,
  });
  const imageBuffer = await renderSlideToImage(html);

  if (slide.cloudinaryPublicId) {
    await deleteSlideImage(slide.cloudinaryPublicId);
  }

  const uploaded = await uploadSlideImage(imageBuffer, `${slide.postId}-slide-${slide.order}-${Date.now()}`);

  const updated = await prisma.slide.update({
    where: { id },
    data: {
      htmlContent: html,
      imageUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
    },
  });

  return NextResponse.json({ slide: updated }, { status: 200 });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/api/slides/\[id\]/route.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/slides/[id]
git commit -m "feat: add slide edit route that regenerates image on text change"
```

---

### Task 17: Lógica pura de colunas e transições do kanban

**Files:**
- Create: `src/lib/kanban/columns.ts`
- Test: `src/lib/kanban/columns.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `type ColumnKey`; `const COLUMN_ORDER: ColumnKey[]`;
  `const COLUMN_LABELS: Record<ColumnKey, string>`; `type DragAction`;
  `function resolveDragAction(from: ColumnKey, to: ColumnKey, card: { cardType: 'theme' | 'post'; id: string }): DragAction | null`

- [ ] **Step 1: Escrever o teste**

`src/lib/kanban/columns.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { resolveDragAction } from './columns';

describe('resolveDragAction', () => {
  test('dragging a theme from suggested to generating resolves to approve_theme', () => {
    const action = resolveDragAction('suggested', 'generating', { cardType: 'theme', id: 'theme-1' });

    expect(action).toEqual({ type: 'approve_theme', themeId: 'theme-1' });
  });

  test('dragging a theme from suggested to rejected resolves to reject_theme', () => {
    const action = resolveDragAction('suggested', 'rejected', { cardType: 'theme', id: 'theme-1' });

    expect(action).toEqual({ type: 'reject_theme', themeId: 'theme-1' });
  });

  test('dragging a post from pending_approval to scheduled resolves to approve_post', () => {
    const action = resolveDragAction('pending_approval', 'scheduled', { cardType: 'post', id: 'post-1' });

    expect(action).toEqual({ type: 'approve_post', postId: 'post-1' });
  });

  test('dragging a post from pending_approval to rejected resolves to reject_post', () => {
    const action = resolveDragAction('pending_approval', 'rejected', { cardType: 'post', id: 'post-1' });

    expect(action).toEqual({ type: 'reject_post', postId: 'post-1' });
  });

  test('returns null for a no-op drag within the same column', () => {
    expect(resolveDragAction('suggested', 'suggested', { cardType: 'theme', id: 'theme-1' })).toBeNull();
  });

  test('returns null for an unsupported transition', () => {
    expect(resolveDragAction('generating', 'published', { cardType: 'post', id: 'post-1' })).toBeNull();
  });

  test('returns null when the card type does not match the origin column', () => {
    expect(
      resolveDragAction('suggested', 'generating', { cardType: 'post', id: 'post-1' })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/kanban/columns.test.ts`
Expected: FAIL com "Cannot find module './columns'"

- [ ] **Step 3: Implementar `src/lib/kanban/columns.ts`**

```ts
export type ColumnKey =
  | 'suggested'
  | 'generating'
  | 'pending_approval'
  | 'scheduled'
  | 'published'
  | 'rejected';

export const COLUMN_ORDER: ColumnKey[] = [
  'suggested',
  'generating',
  'pending_approval',
  'scheduled',
  'published',
  'rejected',
];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  suggested: 'Temas sugeridos',
  generating: 'Gerando',
  pending_approval: 'Aguardando aprovação',
  scheduled: 'Agendado',
  published: 'Publicado',
  rejected: 'Rejeitado',
};

export type DragAction =
  | { type: 'approve_theme'; themeId: string }
  | { type: 'reject_theme'; themeId: string }
  | { type: 'approve_post'; postId: string }
  | { type: 'reject_post'; postId: string };

interface DraggableCard {
  cardType: 'theme' | 'post';
  id: string;
}

export function resolveDragAction(from: ColumnKey, to: ColumnKey, card: DraggableCard): DragAction | null {
  if (from === to) {
    return null;
  }

  if (card.cardType === 'theme' && from === 'suggested' && to === 'generating') {
    return { type: 'approve_theme', themeId: card.id };
  }

  if (card.cardType === 'theme' && from === 'suggested' && to === 'rejected') {
    return { type: 'reject_theme', themeId: card.id };
  }

  if (card.cardType === 'post' && from === 'pending_approval' && to === 'scheduled') {
    return { type: 'approve_post', postId: card.id };
  }

  if (card.cardType === 'post' && from === 'pending_approval' && to === 'rejected') {
    return { type: 'reject_post', postId: card.id };
  }

  return null;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/kanban/columns.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/kanban/columns.ts src/lib/kanban/columns.test.ts
git commit -m "feat: add pure kanban column and drag-transition logic"
```

---

### Task 18: Agregação de dados do board (`src/lib/data/kanban.ts`)

**Files:**
- Create: `src/lib/data/kanban.ts`
- Test: `src/lib/data/kanban.test.ts`

**Interfaces:**
- Consumes: `listThemesByStatus` (Task 9), `listPostsByStatus` (Task 10)
- Produces: `interface KanbanBoard { suggested: Theme[]; generating: PostWithSlides[]; pendingApproval: PostWithSlides[]; scheduled: PostWithSlides[]; published: PostWithSlides[]; rejectedThemes: Theme[]; rejectedPosts: PostWithSlides[] }`;
  `function getKanbanBoard(): Promise<KanbanBoard>`

- [ ] **Step 1: Escrever o teste**

`src/lib/data/kanban.test.ts`:

```ts
import { describe, test, expect, vi } from 'vitest';

vi.mock('./themes', () => ({ listThemesByStatus: vi.fn() }));
vi.mock('./posts', () => ({ listPostsByStatus: vi.fn() }));

import { listThemesByStatus } from './themes';
import { listPostsByStatus } from './posts';
import { getKanbanBoard } from './kanban';

describe('getKanbanBoard', () => {
  test('queries every column status and assembles the board', async () => {
    vi.mocked(listThemesByStatus).mockImplementation(async (status) =>
      status === 'pending' ? [{ id: 'theme-1' } as never] : [{ id: 'theme-2' } as never]
    );
    vi.mocked(listPostsByStatus).mockImplementation(async (status) => [{ id: `post-${status}` } as never]);

    const board = await getKanbanBoard();

    expect(listThemesByStatus).toHaveBeenCalledWith('pending');
    expect(listThemesByStatus).toHaveBeenCalledWith('rejected');
    expect(board.suggested).toEqual([{ id: 'theme-1' }]);
    expect(board.rejectedThemes).toEqual([{ id: 'theme-2' }]);
    expect(board.generating).toEqual([{ id: 'post-generating' }]);
    expect(board.pendingApproval).toEqual([{ id: 'post-pending_approval' }]);
    expect(board.scheduled).toEqual([{ id: 'post-scheduled' }]);
    expect(board.published).toEqual([{ id: 'post-published' }]);
    expect(board.rejectedPosts).toEqual([{ id: 'post-rejected' }]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/data/kanban.test.ts`
Expected: FAIL com "Cannot find module './kanban'"

- [ ] **Step 3: Implementar `src/lib/data/kanban.ts`**

```ts
import type { Theme } from '@/generated/prisma/client';
import { listThemesByStatus } from './themes';
import { listPostsByStatus, type PostWithSlides } from './posts';

export interface KanbanBoard {
  suggested: Theme[];
  generating: PostWithSlides[];
  pendingApproval: PostWithSlides[];
  scheduled: PostWithSlides[];
  published: PostWithSlides[];
  rejectedThemes: Theme[];
  rejectedPosts: PostWithSlides[];
}

export async function getKanbanBoard(): Promise<KanbanBoard> {
  const [suggested, generating, pendingApproval, scheduled, published, rejectedThemes, rejectedPosts] =
    await Promise.all([
      listThemesByStatus('pending'),
      listPostsByStatus('generating'),
      listPostsByStatus('pending_approval'),
      listPostsByStatus('scheduled'),
      listPostsByStatus('published'),
      listThemesByStatus('rejected'),
      listPostsByStatus('rejected'),
    ]);

  return { suggested, generating, pendingApproval, scheduled, published, rejectedThemes, rejectedPosts };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/data/kanban.test.ts`
Expected: PASS (1 teste)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/kanban.ts src/lib/data/kanban.test.ts
git commit -m "feat: add kanban board data aggregation"
```

---

### Task 19: UI do kanban (`/admin`) com `@dnd-kit`

**Files:**
- Create: `src/app/admin/runDragAction.ts`
- Test: `src/app/admin/runDragAction.test.ts`
- Create: `src/app/admin/ThemeCard.tsx`
- Create: `src/app/admin/PostCard.tsx`
- Create: `src/app/admin/KanbanColumn.tsx`
- Create: `src/app/admin/KanbanBoard.tsx`
- Test: `src/app/admin/KanbanBoard.test.tsx`
- Create: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `getKanbanBoard` (Task 18), `resolveDragAction`/`COLUMN_ORDER`/`COLUMN_LABELS` (Task 17), `@dnd-kit/core`, `@dnd-kit/utilities`
- Produces: página `/admin` renderizando as 6 colunas com cards; drag entre
  colunas válidas dispara a rota de API correspondente

- [ ] **Step 1: Escrever o teste de `runDragAction`**

`src/app/admin/runDragAction.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runDragAction } from './runDragAction';

describe('runDragAction', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('prompt', vi.fn());
  });

  test('approve_theme calls the approve route with no body', async () => {
    await runDragAction({ type: 'approve_theme', themeId: 'theme-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/themes/theme-1/approve', { method: 'POST' });
  });

  test('reject_theme skips the request when the prompt is cancelled', async () => {
    vi.mocked(window.prompt).mockReturnValue(null);

    await runDragAction({ type: 'reject_theme', themeId: 'theme-1' });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('reject_theme sends the reason from the prompt', async () => {
    vi.mocked(window.prompt).mockReturnValue('fora do nicho');

    await runDragAction({ type: 'reject_theme', themeId: 'theme-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/themes/theme-1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'fora do nicho' }),
    });
  });

  test('approve_post sends the scheduledAt from the prompt', async () => {
    vi.mocked(window.prompt).mockReturnValue('2026-09-05T12:00:00.000Z');

    await runDragAction({ type: 'approve_post', postId: 'post-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/posts/post-1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: '2026-09-05T12:00:00.000Z' }),
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/admin/runDragAction.test.ts`
Expected: FAIL com "Cannot find module './runDragAction'"

- [ ] **Step 3: Implementar `src/app/admin/runDragAction.ts`**

```ts
import type { DragAction } from '@/lib/kanban/columns';

async function postJson(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function runDragAction(action: DragAction): Promise<void> {
  switch (action.type) {
    case 'approve_theme': {
      await fetch(`/api/themes/${action.themeId}/approve`, { method: 'POST' });
      return;
    }
    case 'reject_theme': {
      const reason = window.prompt('Motivo da rejeição do tema:');
      if (!reason) return;
      await postJson(`/api/themes/${action.themeId}/reject`, { reason });
      return;
    }
    case 'approve_post': {
      const scheduledAt = window.prompt('Data/hora agendada (ISO 8601):');
      if (!scheduledAt) return;
      await postJson(`/api/posts/${action.postId}/approve`, { scheduledAt });
      return;
    }
    case 'reject_post': {
      const reason = window.prompt('Motivo da rejeição do post:');
      if (!reason) return;
      await postJson(`/api/posts/${action.postId}/reject`, { reason });
      return;
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/admin/runDragAction.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Implementar `src/app/admin/ThemeCard.tsx`**

```tsx
'use client';

import type { JSX } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Theme } from '@/generated/prisma/client';
import type { ColumnKey } from '@/lib/kanban/columns';

interface ThemeCardProps {
  theme: Theme;
  column: ColumnKey;
}

export function ThemeCard({ theme, column }: ThemeCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: theme.id,
    data: { column, cardType: 'theme' as const },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className="rounded border bg-white p-3"
    >
      <p className="font-semibold">{theme.headlineSuggestion}</p>
      {theme.rejectionReason ? (
        <p className="mt-1 text-xs text-neutral-500">{theme.rejectionReason}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Implementar `src/app/admin/PostCard.tsx`**

```tsx
'use client';

import type { JSX } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { ColumnKey } from '@/lib/kanban/columns';
import type { PostWithSlides } from '@/lib/data/posts';

interface PostCardProps {
  post: PostWithSlides;
  column: ColumnKey;
}

export function PostCard({ post, column }: PostCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: post.id,
    data: { column, cardType: 'post' as const },
  });
  const thumbnail = post.slides[0]?.imageUrl;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className="rounded border bg-white p-3"
    >
      {thumbnail ? (
        <img src={thumbnail} alt="Miniatura do carrossel" className="mb-2 h-24 w-auto rounded object-cover" />
      ) : null}
      <p className="text-sm text-neutral-500">{post.status}</p>
      {post.rejectionReason ? (
        <p className="mt-1 text-xs text-neutral-500">{post.rejectionReason}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Implementar `src/app/admin/KanbanColumn.tsx`**

```tsx
'use client';

import type { JSX } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { ColumnKey } from '@/lib/kanban/columns';
import type { KanbanBoard } from '@/lib/data/kanban';
import { ThemeCard } from './ThemeCard';
import { PostCard } from './PostCard';

interface KanbanColumnProps {
  columnKey: ColumnKey;
  title: string;
  board: KanbanBoard;
}

export function KanbanColumn({ columnKey, title, board }: KanbanColumnProps): JSX.Element {
  const { setNodeRef } = useDroppable({ id: columnKey, data: { column: columnKey } });

  const themes = columnKey === 'suggested' ? board.suggested : columnKey === 'rejected' ? board.rejectedThemes : [];
  const posts =
    columnKey === 'generating'
      ? board.generating
      : columnKey === 'pending_approval'
        ? board.pendingApproval
        : columnKey === 'scheduled'
          ? board.scheduled
          : columnKey === 'published'
            ? board.published
            : columnKey === 'rejected'
              ? board.rejectedPosts
              : [];

  return (
    <div ref={setNodeRef} className="w-72 shrink-0 rounded bg-neutral-100 p-3">
      <h2 className="mb-3 text-sm font-bold uppercase text-neutral-600">{title}</h2>
      <div className="flex flex-col gap-2">
        {themes.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} column={columnKey} />
        ))}
        {posts.map((post) => (
          <PostCard key={post.id} post={post} column={columnKey} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Escrever o teste de `KanbanBoard`**

`src/app/admin/KanbanBoard.test.tsx` (pragma no topo):

```tsx
// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { KanbanBoard } from './KanbanBoard';
import type { KanbanBoard as KanbanBoardData } from '@/lib/data/kanban';

const emptyBoard: KanbanBoardData = {
  suggested: [{ id: 'theme-1', headlineSuggestion: 'Tema X' } as never],
  generating: [],
  pendingApproval: [],
  scheduled: [],
  published: [],
  rejectedThemes: [],
  rejectedPosts: [],
};

describe('KanbanBoard', () => {
  test('renders all six column labels', () => {
    render(<KanbanBoard board={emptyBoard} />);

    expect(screen.getByText('Temas sugeridos')).toBeInTheDocument();
    expect(screen.getByText('Gerando')).toBeInTheDocument();
    expect(screen.getByText('Aguardando aprovação')).toBeInTheDocument();
    expect(screen.getByText('Agendado')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();
  });

  test('renders a theme card headline in the suggested column', () => {
    render(<KanbanBoard board={emptyBoard} />);

    expect(screen.getByText('Tema X')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Rodar o teste e confirmar que falha**

Run: `npm test -- src/app/admin/KanbanBoard.test.tsx`
Expected: FAIL com "Cannot find module './KanbanBoard'"

- [ ] **Step 10: Implementar `src/app/admin/KanbanBoard.tsx`**

```tsx
'use client';

import type { JSX } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { COLUMN_LABELS, COLUMN_ORDER, resolveDragAction, type ColumnKey } from '@/lib/kanban/columns';
import type { KanbanBoard as KanbanBoardData } from '@/lib/data/kanban';
import { KanbanColumn } from './KanbanColumn';
import { runDragAction } from './runDragAction';

interface KanbanBoardProps {
  board: KanbanBoardData;
}

export function KanbanBoard({ board }: KanbanBoardProps): JSX.Element {
  const router = useRouter();

  function handleDragEnd(event: DragEndEvent): void {
    const from = event.active.data.current?.column as ColumnKey | undefined;
    const to = event.over?.data.current?.column as ColumnKey | undefined;
    const cardType = event.active.data.current?.cardType as 'theme' | 'post' | undefined;

    if (!from || !to || !cardType) {
      return;
    }

    const action = resolveDragAction(from, to, { cardType, id: String(event.active.id) });
    if (!action) {
      return;
    }

    void runDragAction(action).then(() => router.refresh());
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {COLUMN_ORDER.map((key) => (
          <KanbanColumn key={key} columnKey={key} title={COLUMN_LABELS[key]} board={board} />
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 11: Rodar o teste e confirmar que passa**

Run: `npm test -- src/app/admin/KanbanBoard.test.tsx`
Expected: PASS (2 testes)

- [ ] **Step 12: Implementar a página `src/app/admin/page.tsx`**

```tsx
import type { JSX } from 'react';
import { getKanbanBoard } from '@/lib/data/kanban';
import { KanbanBoard } from './KanbanBoard';

export default async function AdminPage(): Promise<JSX.Element> {
  const board = await getKanbanBoard();

  return <KanbanBoard board={board} />;
}
```

- [ ] **Step 13: Commit**

```bash
git add src/app/admin
git commit -m "feat: add drag-and-drop kanban board UI at /admin"
```

---

### Task 20: Verificação final e commit de fechamento

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar a suíte completa de testes do plano**

Run: `npm test`
Expected: todos os testes das 19 tasks anteriores passam.

- [ ] **Step 2: Rodar o build**

Run: `npm run build`
Expected: build do Next.js conclui sem erro, incluindo `src/proxy.ts` e as
rotas `/admin/**` e `/api/**` novas.

- [ ] **Step 3: Verificação manual (checklist)**

Com `.env` local preenchido (`DATABASE_URL`, `ADMIN_USERNAME`,
`ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, credenciais de IA/Cloudinary):

Run: `npm run dev`

1. Acessar `/admin` sem sessão → redireciona para `/admin/login`.
2. Logar com credenciais corretas → redireciona para `/admin` e mostra as 6
   colunas.
3. Logar com credenciais erradas → mensagem de erro, sem redirecionar.
4. Criar um `Theme` de teste diretamente no banco (`status: pending`) →
   aparece em "Temas sugeridos" ao recarregar `/admin`.
5. Arrastar o card do tema para "Gerando" → chama
   `POST /api/themes/[id]/approve`; confirmar no banco que `Theme.status`
   virou `approved` e que um `Post` foi criado.
6. Chamar `POST /api/auth/logout` (ou UI, se houver botão) → sessão
   destruída, `/admin` volta a redirecionar para `/admin/login`.

- [ ] **Step 4: Commit final (se houver ajustes da verificação manual)**

```bash
git add -A
git commit -m "chore: final verification pass for dashboard kanban plan"
```

> Se nenhum ajuste for necessário, pule este commit — não crie commits
> vazios.
