# Handoff — carousel-desk

Estado em 2026-09-02, fim de sessão (PC vai desligar, continuação em outra máquina).

## Status geral

O sistema está **no ar e funcional em produção**, testado ponta a ponta com
um post real publicado no Instagram:
https://www.instagram.com/p/DczLP_tD1_M/

- Produção: https://carousel-desk.vercel.app
- Admin/dashboard: https://carousel-desk.vercel.app/admin (login em `/admin/login`)
  - usuário: `goose`
  - senha: `goose-carousel-2026`
- Projeto Vercel: `weiekingg-4990s-projects/carousel-desk`
- Banco: Neon Postgres, provisionado via integração Vercel Marketplace
  (nome do resource: `neon-red-door`)
- Repo: `github.com/WeidScatolin/carousel-desk`, branch `main`

Fluxo completo validado com dados reais: discover (scraping + IA) → aprovar
tema → gerar copy/slides (Playwright + Cloudinary) → aprovar/agendar →
publicar no Instagram → limpar Cloudinary pós-publicação.

## O que falta (nesta ordem de prioridade)

### 1. `PEXELS_API_KEY` — único item realmente pendente

A feature de "imagem que combina com o post" está implementada e no ar:
- Se o artigo raspado tem imagem própria, ela é usada (funciona, já testado
  em produção — ver commit `74150b2`).
- Se **não** tem, o código tenta cair para uma busca no Pexels
  (`src/lib/images/resolveThemeImage.ts` → `src/lib/images/pexelsClient.ts`),
  mas essa env var nunca foi configurada, então hoje esse fallback
  silenciosamente retorna "sem imagem" (não quebra nada, só fica sem foto).

**Para resolver:** criar conta em https://www.pexels.com/api/ (instantâneo,
sem aprovação), pegar a API key, e configurar no Vercel:

```bash
vercel env add PEXELS_API_KEY production --value "<key>"
vercel env add PEXELS_API_KEY preview --value "<key>"
vercel env add PEXELS_API_KEY development --value "<key>"
vercel deploy --prod --yes
```

Depois, testar aprovando um tema cujo `referenceImageUrls` esteja vazio no
banco, e confirmar que o cover sai com foto (hoje sairia sem, já que o
fallback não tem key).

### 2. Cron do GitHub Actions não está configurado

Os workflows existem no repo (`.github/workflows/`) mas **não disparam
sozinhos** ainda — faltam os secrets no GitHub:
- `APP_URL` → `https://carousel-desk.vercel.app`
- `DISCOVERY_API_TOKEN` → mesmo valor da env var `DISCOVERY_API_TOKEN` no Vercel
- secret equivalente para o workflow de publish, usando `PUBLISH_API_TOKEN`

**Atenção:** os tokens `DISCOVERY_API_TOKEN` e `PUBLISH_API_TOKEN` no Vercel
foram regenerados várias vezes durante testes manuais desta sessão (a cada
`vercel env add ... --force`). Antes de configurar o secret do GitHub, gere
um valor novo e estável, configure nos dois lugares (Vercel + GitHub) ao
mesmo tempo, e não regenere de novo sem atualizar os dois.

Até isso ser feito, discover/publish só funcionam via chamada manual
(`curl -X POST .../api/pipeline/discover` com o Bearer token certo).

### 3. Limpeza de worktrees (sem urgência, cosmético)

- `impl-scraping-temas/` e `impl-publicacao-instagram/`: já foram
  desregistradas do git (branches deletadas, fully-merged), mas as pastas
  físicas continuam em `C:/Users/weid.machado/orca/workspaces/carousel-desk/`
  porque algum processo (antivírus/indexador) segurava um handle nelas.
  Apagar manualmente quando possível.
- `pufferfish/`: era o worktree desta sessão. Quando não precisar mais dele,
  rodar (a partir da `main`): `git worktree remove pufferfish`

## Decisões já tomadas nesta sessão (não reabrir sem confirmar com o usuário)

- **Hospedagem: Vercel**, não Render (o design doc original tinha Render —
  foi corrigido). Neon + Cloudinary + GitHub Actions (só como cron trigger)
  continuam.
- **Scraping: TypeScript + cheerio** rodando in-process na própria rota
  Next.js, não Python/Scrapling/Docker (também corrigido do design original).
  Fontes ativas: TechCrunch e The Verge. Ars Technica foi removida da lista
  padrão porque bloqueia fetch simples (Cloudflare, retorna 202 vazio) — só
  entraria de volta com um browser headless, o que a rota de discover evita
  de propósito.
- **Instagram**: usa o fluxo "Instagram API with Instagram Login" (tokens
  `IGAA...`), API em `graph.instagram.com`, não `graph.facebook.com` (sem
  Página do Facebook vinculada).
- **Imagem dos slides**: cover recebe foto full-bleed (raspada do artigo,
  com Pexels como fallback pendente); evidence recebe a mesma imagem como
  bloco de apoio pequeno; framework nunca recebe imagem (é puro
  texto/checklist — imagem de fundo atrapalharia a leitura).
- **Playwright em produção**: usa `@sparticuz/chromium` (não o Chromium
  padrão do pacote `playwright`, que não embarca no bundle serverless da
  Vercel). Ver `next.config.ts` (`serverExternalPackages` +
  `outputFileTracingIncludes`) e `src/lib/render/renderSlideToImage.ts`.

## Bugs reais corrigidos nesta sessão (histórico, não precisa reabrir)

Sequência de commits na `main` (do mais antigo ao mais novo) — todos com
mensagem explicando a causa raiz, ver `git log`:
1. `next.config.ts` com `output:'standalone'` quebrava o build no Vercel
2. Reescrita do scraper de temas: Python/Scrapling/Docker → TypeScript/cheerio
3. Seletores do scraper (TechCrunch/The Verge) desatualizados — reescritos
   contra o markup real dos sites
4. Instagram: host errado (`graph.facebook.com` → `graph.instagram.com`)
5. Faltava `postinstall: prisma generate` no `package.json` — client nunca
   era gerado no deploy da Vercel
6. Modelo NVIDIA padrão descontinuado (410 Gone) — trocado
7. Modelo substituto não seguia o schema JSON pedido — trocado de novo para
   `openai/gpt-oss-120b`
8. Env vars copiadas do `.env` de dev vieram com aspas literais coladas no
   valor (ex.: `PROVIDER_THEME_SUGGESTION` virou `"nvidia"` em vez de
   `nvidia`) — corrigido, reconfigurado tudo via `--value` explícito
9. Playwright/Chromium não empacotava no bundle serverless da Vercel —
   `@sparticuz/chromium` + `serverExternalPackages` + `outputFileTracingIncludes`
10. Bug de CSS que deixava **todo** headline invisível em produção (aspas
    duplas do `font-family` quebrando o atributo `style`)
11. IA às vezes inseria HTML cru no texto do headline — prompt reforçado +
    sanitização defensiva
12. Feature de imagem real no slide (esta sessão, commit `74150b2`)

## Onde estão as credenciais

Nada em texto puro neste arquivo. Tudo configurado como env var no Vercel
(`vercel env ls` para ver os nomes, os valores não aparecem por CLI — usar o
dashboard em vercel.com se precisar conferir/trocar um valor). Lista das
env vars que devem existir em produção: `DATABASE_URL` (+ variantes do Neon),
`NVIDIA_API_KEY`, `ANTHROPIC_API_KEY` (não usada hoje — todos os
`PROVIDER_*` estão em `nvidia`), `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PROVIDER_THEME_SUGGESTION`,
`PROVIDER_IMAGE_ANALYSIS`, `PROVIDER_COPYWRITING`, `DISCOVERY_API_TOKEN`,
`PUBLISH_API_TOKEN`, `SESSION_SECRET`, `ADMIN_USERNAME`,
`ADMIN_PASSWORD_HASH`, `INSTAGRAM_ACCESS_TOKEN`,
`INSTAGRAM_BUSINESS_ACCOUNT_ID`, e (pendente) `PEXELS_API_KEY`.

O `.env` local (neste worktree) tem só placeholders de teste, exceto
`DATABASE_URL` — não é fonte confiável para produção. Use
`vercel env pull .env.local --environment production` para puxar os valores
reais quando precisar rodar algo localmente contra produção.
