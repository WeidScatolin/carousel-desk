# carousel-desk — Design

Automação de um Instagram de tecnologia: descoberta de temas por scraping,
geração de carrosséis editoriais por IA, aprovação humana em duas etapas via
dashboard kanban, e publicação automática diária pela API oficial do
Instagram.

## Decisões já tomadas (não reabrir sem confirmar com o usuário)

- **Escopo v1**: só carrossel (imagem). Vídeo/Reels fica para uma fase
  futura, fora de escopo agora.
- **Hospedagem**: 100% free tier — sem VPS, sem Docker. Vercel (Next.js,
  Fluid Compute — já suporta Playwright/pacotes de até 5GB e reaproveita
  instância de função, então o render dos slides roda nas próprias rotas de
  API) + Neon (Postgres free, via Prisma) + Cloudinary (free, storage de
  imagem) + GitHub Actions (cron gratuito, inalterado).
- **Postagem**: API oficial do Instagram (Graph API), nunca automação
  não-oficial — risco de banimento é inaceitável para uma conta que posta
  todo dia.
- **Agendamento**: GitHub Actions (`schedule`) dispara requisições HTTP para
  rotas de API do Next.js — mesmo padrão do projeto de ad-spy do usuário
  (`pg_net`/cron → API), adaptado para GitHub Actions já que não há
  pg_cron/pg_net no Neon.
- **Orquestração de IA**: Langflow é só ferramenta de **prototipagem** (para
  desenhar/testar prompts e o fluxo visualmente). A versão de produção roda
  como código direto no Next.js/scripts — sem Langflow rodando em produção
  (nenhum container/serviço extra).
- **Geração visual**: não integra o OpenDesign como dependência (ele é
  feito para uso interativo humano+agente, não para rodar sozinho em
  background). Em vez disso, replica-se a ideia central, mas travada: um
  arquivo `DESIGN.md` (contrato de marca) documenta o sistema visual, e o
  HTML de cada slide é montado por **templates determinísticos no
  código** (não gerados por IA) — três funções fixas (`cover`/`evidence`/
  `framework`) que aplicam paleta, tipografia e layout do `DESIGN.md`
  diretamente, só injetando o texto que a IA escreveu. Isso é uma trava
  proposital: nenhum provedor de IA, gratuito ou pago, pode fugir do
  padrão visual da marca, e a etapa não depende de nenhuma chamada de IA.
  Playwright renderiza esse HTML em PNG de alta resolução (viewport exato
  + `deviceScaleFactor` 2x/3x — não é um "print de tela", é renderização
  controlada, sem perda de qualidade).
- **Fontes de imagem**: combinação de banco de imagens com licença
  (Unsplash/Pexels) e scraping de imagens reais da web (fetch + parsing de
  HTML em TypeScript — sem subprocesso Python, sem Docker). A origem de
  cada imagem fica visível no dashboard para o usuário poder vetar uma
  imagem raspada específica antes de aprovar (risco de direito autoral
  aceito conscientemente pelo usuário, mitigado por revisão manual).
- **Provedores de IA configuráveis por etapa**: NVIDIA NIM (grátis) e Claude
  (Anthropic, pago) por trás de uma interface comum, escolhidos via
  variável de ambiente por tarefa — o usuário pode rodar 100% grátis (só
  NVIDIA) ou misto. As únicas etapas que chamam IA são sugestão de tema,
  análise de imagem de referência e copywriting (a geração de HTML do
  slide é determinística, sem IA — ver "Geração visual" acima). Ponto de
  partida: 100% NVIDIA (grátis); trocar `PROVIDER_COPYWRITING` para
  `claude` é uma opção disponível se a qualidade do texto justificar o
  custo (baixíssimo nesse volume — 1 post/dia).
- **Fluxo de rejeição/edição**: o usuário pode tanto **editar o texto** de
  cada slide (e regenerar só a imagem daquele slide) quanto **rejeitar sem
  editar** (o tema volta para a fila e tudo é gerado do zero).
- **Sem fila/retry automático**: mesmo princípio do ad-spy — se uma execução
  falhar (scraping, geração, publicação), fica marcada com erro visível no
  dashboard; o próximo disparo do cron tenta de novo naturalmente.
- **Limpeza do Cloudinary pós-publicação**: assim que um post é publicado
  com sucesso no Instagram, as imagens dos slides são apagadas do
  Cloudinary (o Instagram já guarda a cópia definitiva) para não consumir
  o free tier de storage ao longo do tempo. A linha do post/slide continua
  no histórico do kanban (coluna "Publicado"), só sem a imagem armazenada.

## Identidade visual do conteúdo (brief do usuário, adaptado)

Baseado em referência de um perfil do nicho ("BrandsDecoded"), adaptado para
ter assinatura própria em vez de cópia literal:

- **Paleta**: preto carvão `#0A0A0A`, creme `#F2F0E8`, laranja-vermelho
  `#FF3B0A` (cor de destaque/atenção, não decorativa), roxo-preto `#11101D`.
- **Tipografia**: manchetes em fonte condensada pesada e caixa alta (Barlow
  Condensed ExtraBold / Oswald Heavy / Bebas Neue); corpo de texto em
  Inter/Manrope; acentos editoriais em serifada (Instrument Serif/Cormorant
  Garamond).
- **Formato**: 1080×1350px, margens 64-80px.
- **Três templates fixos** (o `DESIGN.md` documenta exatamente estes três):
  1. **Capa cinematográfica** — foto full-bleed, fundo escurecido embaixo,
     título de 3-6 linhas (máx. 14-18 palavras — mais curto que a
     referência), uma expressão em destaque laranja.
  2. **Página de evidência** — fundo claro (off-white/lavanda), gráficos,
     prints, dados, fonte pequena no rodapé citando a origem.
  3. **Página de framework/checklist** — modelo prático aplicável (ex:
     "Modelo 01", comparação, checklist), uma tese principal por página.
- **Correções deliberadas em relação à referência**: manchetes mais curtas;
  assinatura visual própria (numeração ou moldura reconhecível sem o nome);
  mais evidência real (fontes citadas); menos dependência de rostos
  conhecidos (intercalar com diagramas/imagens próprias); slides mais
  "respirados"; conclusão que entrega algo salvável (matriz/checklist), não
  só uma frase de efeito.
- **Tom editorial**: confiante, levemente provocador, analítico ("explico o
  mecanismo" em vez de "5 dicas"), focado em tecnologia/comportamento
  digital/negócios.

## Arquitetura

```
GitHub Actions (cron, grátis)
   ├─ diário: POST /api/pipeline/discover      (dispara scraping de temas)
   └─ a cada N min: POST /api/pipeline/publish  (checa agendados e publica)

Vercel (Next.js, App Router, TypeScript — Fluid Compute)
   ├─ dashboard kanban (admin único, auth via iron-session, como no
   │  personal-hub do usuário)
   ├─ /api/pipeline/discover   → scraping em TypeScript busca temas + imagens
   │                             de referência; grava Theme (status: pending)
   ├─ /api/pipeline/generate   → após aprovação de tema: gera copy (LLM),
   │                             monta o HTML por slide (template
   │                             determinístico, sem IA), renderiza PNG
   │                             (Playwright), sobe no Cloudinary, grava
   │                             Post+Slides (status: pending_approval)
   ├─ /api/pipeline/publish    → publica carrossel aprovado+agendado via
   │                             Instagram Graph API; após sucesso, apaga as
   │                             imagens dos slides no Cloudinary
   └─ Playwright roda dentro das rotas de API (Fluid Compute suporta pacotes
      de até 5GB e reaproveita instância de função entre requisições)

Neon (Postgres free, via Prisma)
   └─ Theme, Post, Slide, histórico

Cloudinary (free tier)
   └─ imagens finais dos slides (PNG), com CDN

Serviços externos chamados pelo app
   ├─ scraping (TS/fetch)  → notícias/tendências de tech + imagens de
   │                         referência/reais
   ├─ Unsplash/Pexels API  → banco de imagens com licença
   ├─ NVIDIA NIM / Claude  → texto e visão, escolhido por config por tarefa
   └─ Instagram Graph API  → publicação do carrossel
```

## Fluxo (ciclo de vida de um post)

```
Tema sugerido (scraping TS + LLM)
   │  [usuário aprova/rejeita o tema no kanban]
   ▼
Tema aprovado → gerando carrossel (copy + slides + imagens)
   │
   ▼
Aguardando aprovação do carrossel (preview no kanban)
   │  [usuário edita texto de um slide → regenera aquele slide]
   │  [usuário aprova → agenda] ou [usuário rejeita → tema volta pra fila]
   ▼
Agendado
   │  [GitHub Actions publica no horário]
   ▼
Publicado
```

Colunas do kanban: **Temas sugeridos** · **Gerando** · **Aguardando
aprovação** · **Agendado** · **Publicado** · **Rejeitado** (com motivo).

## Modelo de dados (Prisma/Postgres)

- **Theme**: `id`, `sourceUrl`, `summary`, `headlineSuggestion`, `status`
  (`pending` | `approved` | `rejected`), `createdAt`
- **Post**: `id`, `themeId`, `status` (`generating` | `pending_approval` |
  `scheduled` | `published` | `rejected` | `error`), `scheduledAt`,
  `publishedAt`, `instagramPostId`, `errorMessage`
- **Slide**: `id`, `postId`, `order`, `template`
  (`cover` | `evidence` | `framework`), `htmlContent`, `imageUrl`
  (Cloudinary, nulo após limpeza pós-publicação), `cloudinaryPublicId`,
  `imageSource` (`stock` | `scraped`), `sourceImageUrl`, `imageDeletedAt`

## Abstração de provedor de IA

Uma função por tarefa, cada uma escolhendo o cliente certo (NVIDIA NIM ou
Anthropic) via variável de ambiente:

```
PROVIDER_THEME_SUGGESTION=nvidia
PROVIDER_IMAGE_ANALYSIS=nvidia
PROVIDER_COPYWRITING=nvidia
```

Funções que usam IA: `suggestThemes()`, `analyzeReferenceImage()`,
`writeCopy()` — agnósticas ao provedor por fora, trocar de config não exige
mudança de código chamador. `generateSlideHtml()` **não** está nessa lista:
é uma função determinística (templates fixos em código), sem provedor
configurável, garantindo que o visual nunca fuja do `DESIGN.md`.

## Tratamento de erro

Sem fila/retry automático. Falha em qualquer etapa marca o registro
(`Post.status = error`, com `errorMessage`) visível no dashboard. O próximo
disparo do cron correspondente tenta de novo naturalmente. Sem alertas
externos nesta fase (o usuário confere o dashboard).

## Testes

Seguindo os padrões globais do usuário: Vitest + Testing Library, padrão
AAA, nomes descritivos. Cobertura mínima 80% no código de lógica de
pipeline e rotas de API (scraping, geração, publicação) — sem E2E completo
nesta fase (mesma decisão do personal-hub).

## Fora de escopo (v1)

- Vídeo/Reels.
- Cross-post para outras redes.
- Score de escala/analytics de performance dos posts.
- Edição visual (drag/resize) do slide — só edição de texto.
- Múltiplos administradores/contas.

## Riscos conhecidos e aceitos

- **Direito autoral de imagens raspadas**: mitigado por revisão manual no
  dashboard (origem da imagem sempre visível antes de aprovar).
- **Dependência de free tiers** (Vercel, Neon, Cloudinary, NVIDIA NIM):
  aceitável para volume de 1 post/dia; reavaliar se o volume crescer.
