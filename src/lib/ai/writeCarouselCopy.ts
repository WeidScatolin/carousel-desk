import { z } from 'zod';
import { completeWithClaude } from './claudeClient';
import { loadDesignSystem } from './designSystem';
import { completeWithNvidia } from './nvidiaClient';
import { parseJsonResponse } from './extractJson';
import { resolveProvider } from './types';

// Mobile-readability caps, shared with anything that needs to warn or
// block on oversized text (e.g. the approval-gate checks in Fase 8).
export const COVER_MAX_WORDS = 18;
export const BODY_MAX_CHARS = 280;
export const MIN_SLIDES = 6;
export const MAX_SLIDES = 13;

const SLIDE_ROLES = [
  'cover',
  'problem',
  'consequence',
  'mechanism',
  'example',
  'list_item',
  'evidence',
  'risk',
  'framework',
  'bridge',
  'cta',
] as const;

const SLIDE_TEMPLATES = [
  'cover_cinematic',
  'editorial_text',
  'evidence',
  'framework',
  'list_item',
  'chat_demo',
  'case_study',
  'risk',
  'cta',
] as const;

const VISUAL_TYPES = ['main_image', 'diagram', 'mockup', 'screenshot', 'data', 'typography_only'] as const;

const slideItemSchema = z.object({
  role: z.enum(SLIDE_ROLES),
  template: z.enum(SLIDE_TEMPLATES),
  headline: z.string().trim().min(1),
  body: z.string().trim().min(1),
  accentPhrase: z.string().trim().min(1).nullable().optional(),
  kicker: z.string().trim().min(1).nullable().optional(),
  sourceLabel: z.string().trim().min(1).nullable().optional(),
  visualType: z.enum(VISUAL_TYPES),
  visualInstructions: z.string().trim().min(1).nullable().optional(),
});

const carouselCopySchema = z.object({
  hookVariants: z.array(z.string().trim().min(1)).length(3),
  hook: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  ctaKeyword: z.string().trim().min(1).nullable(),
  slides: z.array(slideItemSchema).min(MIN_SLIDES).max(MAX_SLIDES),
});

export type SlideRoleName = (typeof SLIDE_ROLES)[number];
export type SlideTemplateName = (typeof SLIDE_TEMPLATES)[number];
export type SlideVisualTypeName = (typeof VISUAL_TYPES)[number];

export interface SlideCopyItem {
  role: SlideRoleName;
  template: SlideTemplateName;
  headline: string;
  body: string;
  accentPhrase: string | null;
  kicker: string | null;
  sourceLabel: string | null;
  visualType: SlideVisualTypeName;
  visualInstructions: string | null;
}

export interface CarouselCopy {
  hookVariants: string[];
  hook: string;
  caption: string;
  ctaKeyword: string | null;
  slides: SlideCopyItem[];
}

export interface CarouselCopyThemeInput {
  headline: string;
  articleBody: string;
  articleFacts: string[];
}

export interface CarouselCopyBrief {
  contentPillar: string;
  funnelStage: string;
  postGoal: string;
  targetPain: string;
  businessApplication: string;
  angle: string;
  hook: string;
  hookVariants: string[];
}

export interface CarouselCopyBrand {
  positioning: string;
  targetAudience: string;
  promise: string;
  tone: string;
  instagramHandle: string;
}

export interface CarouselCopyLeadMagnet {
  ctaKeyword: string;
  name: string;
  description: string;
  qualificationQuestion: string;
}

// Strip HTML tags and the common markdown emphasis markers a model
// sometimes slips in, instead of failing the whole generation over a
// formatting slip — mirrors the defensive sanitization writeCopy.ts used.
function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/(?<![A-Za-z0-9])_(.*?)_(?![A-Za-z0-9])/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

function sanitizeSlide(slide: z.infer<typeof slideItemSchema>): SlideCopyItem {
  const headline = stripMarkup(slide.headline);
  const body = stripMarkup(slide.body);
  const accentPhrase = slide.accentPhrase ? stripMarkup(slide.accentPhrase) : null;

  return {
    role: slide.role,
    template: slide.template,
    headline,
    body,
    // A highlighted phrase only makes sense if it's real text from this
    // headline — never trust a phrase the model invented separately.
    accentPhrase: accentPhrase && headline.includes(accentPhrase) ? accentPhrase : null,
    kicker: slide.kicker ? stripMarkup(slide.kicker) : null,
    sourceLabel: slide.sourceLabel ? stripMarkup(slide.sourceLabel) : null,
    visualType: slide.visualType,
    visualInstructions: slide.visualInstructions ? stripMarkup(slide.visualInstructions) : null,
  };
}

function validateStructure(copy: z.infer<typeof carouselCopySchema>, postGoal: string): void {
  const [firstSlide] = copy.slides;
  if (firstSlide?.role !== 'cover') {
    throw new Error('writeCarouselCopy: the first slide must have role "cover"');
  }

  const coverWordCount = firstSlide.headline.trim().split(/\s+/).filter(Boolean).length;
  if (coverWordCount > COVER_MAX_WORDS) {
    throw new Error(
      `writeCarouselCopy: cover headline has ${coverWordCount} words, exceeding the ${COVER_MAX_WORDS}-word limit`,
    );
  }

  for (const [index, slide] of copy.slides.entries()) {
    if (slide.body.length > BODY_MAX_CHARS) {
      throw new Error(
        `writeCarouselCopy: slide at index ${index} body has ${slide.body.length} characters, exceeding the ${BODY_MAX_CHARS}-character limit`,
      );
    }
  }

  if (postGoal === 'comment_dm') {
    const lastSlide = copy.slides[copy.slides.length - 1];
    if (lastSlide?.role !== 'cta') {
      throw new Error('writeCarouselCopy: a comment_dm carousel must end with a "cta" slide');
    }
    if (!copy.ctaKeyword) {
      throw new Error('writeCarouselCopy: a comment_dm carousel must have a ctaKeyword');
    }
  }
}

function buildPrompt(
  theme: CarouselCopyThemeInput,
  brief: CarouselCopyBrief,
  brand: CarouselCopyBrand,
  leadMagnet: CarouselCopyLeadMagnet | null,
): string {
  return [
    loadDesignSystem(),
    '',
    '## Posicionamento da marca',
    `Público: ${brand.targetAudience}`,
    `Promessa: ${brand.promise}`,
    `Tom: ${brand.tone}`,
    `Handle do Instagram: ${brand.instagramHandle}`,
    '',
    '## Brief estratégico deste tema',
    `Pilar de conteúdo: ${brief.contentPillar} (radar=mudança+mecanismo+aplicação; blueprint=passo a passo demonstrável; diagnostic=sintoma+causa+teste; proof=situação inicial+processo+resultado)`,
    `Estágio do funil: ${brief.funnelStage}`,
    `Objetivo do post: ${brief.postGoal} (comment_dm exige CTA de comentário no final; follow/save_share não devem pedir comentário)`,
    `Dor ativada: ${brief.targetPain}`,
    `Aplicação empresarial: ${brief.businessApplication}`,
    `Ângulo: ${brief.angle}`,
    `Gancho de referência: ${brief.hook}`,
    '',
    '## Artigo-fonte (use SOMENTE estas informações, nunca invente dado ausente)',
    `Manchete: ${theme.headline}`,
    theme.articleBody,
    '',
    'Fatos/números extraídos:',
    theme.articleFacts.length > 0 ? theme.articleFacts.map((fact) => `- ${fact}`).join('\n') : '(nenhum)',
    '',
    leadMagnet
      ? [
          '## Material complementar (lead magnet) para este post',
          `Palavra-chave: ${leadMagnet.ctaKeyword}`,
          `Material: ${leadMagnet.name} — ${leadMagnet.description}`,
          `Pergunta de qualificação (para a legenda mencionar o que a pessoa recebe, NÃO a pergunta em si): ${leadMagnet.qualificationQuestion}`,
        ].join('\n')
      : '## Nenhum material complementar vinculado a este post.',
    '',
    'Escreva o carrossel completo. Regras obrigatórias:',
    `- Entre ${MIN_SLIDES} e ${MAX_SLIDES} slides. Notícias/radar: 7-9. Blueprint/checklist: pode ir até ${MAX_SLIDES}. Diagnóstico e prova: o que o conteúdo pedir, dentro do intervalo.`,
    '- O primeiro slide tem role "cover" e no máximo 18 palavras no headline.',
    '- Uma ideia principal por slide. Texto legível em celular (corpo curto).',
    '- Nunca use HTML ou markdown no texto — texto puro apenas.',
    '- accentPhrase é uma frase que JÁ aparece literalmente dentro do headline daquele slide (nunca uma frase nova) — no máximo uma por slide, e só quando fizer sentido semântico (nunca destaque automaticamente a última palavra).',
    '- Dados numéricos devem vir com sourceLabel citando a origem.',
    '- Slides factuais precisam deixar claro algum risco ou limitação, não só o benefício.',
    '- visualType escolhe entre main_image, diagram, mockup, screenshot, data ou typography_only — não repita main_image em todo slide; o framework normalmente é typography_only.',
    brief.postGoal === 'comment_dm'
      ? '- Termina com um slide role "cta" e template "cta" pedindo o comentário da palavra-chave.'
      : '- Não peça comentário — o objetivo deste post é follow ou salvar/compartilhar.',
    '',
    'A legenda (caption) segue esta estrutura quando postGoal é comment_dm: (1) abre com o CTA ou uma promessa muito clara; (2) aprofunda o assunto; (3) mostra uma nuance, risco ou erro comum; (4) explica exatamente o material entregue; (5) repete o CTA no final. Uma única ação principal — nunca mais de um CTA na legenda.',
    '',
    'Responda SOMENTE com um objeto JSON com os campos: hookVariants (array de',
    'exatamente 3 ganchos curtos), hook (o gancho escolhido, um dos 3),',
    'caption (texto puro, com quebras de linha reais), ctaKeyword (a palavra-chave',
    'em maiúsculas quando postGoal for comment_dm, ou null caso contrário),',
    'slides (array de objetos com role, template, headline, body,',
    'accentPhrase, kicker, sourceLabel, visualType, visualInstructions —',
    'os campos opcionais podem ser null quando não fizerem sentido).',
  ].join('\n');
}

export async function writeCarouselCopy(
  theme: CarouselCopyThemeInput,
  brief: CarouselCopyBrief,
  brand: CarouselCopyBrand,
  leadMagnet: CarouselCopyLeadMagnet | null = null,
): Promise<CarouselCopy> {
  const provider = resolveProvider('COPYWRITING');
  const prompt = buildPrompt(theme, brief, brand, leadMagnet);
  const raw = provider === 'nvidia' ? await completeWithNvidia(prompt) : await completeWithClaude(prompt);
  const parsed = parseJsonResponse(raw, carouselCopySchema, 'writeCarouselCopy');

  validateStructure(parsed, brief.postGoal);

  return {
    hookVariants: parsed.hookVariants,
    hook: parsed.hook,
    caption: stripMarkup(parsed.caption),
    ctaKeyword: parsed.ctaKeyword ? parsed.ctaKeyword.trim().toUpperCase() : null,
    slides: parsed.slides.map(sanitizeSlide),
  };
}
