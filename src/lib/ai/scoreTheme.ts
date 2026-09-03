import { z } from 'zod';
import { completeWithClaude } from './claudeClient';
import { loadDesignSystem } from './designSystem';
import { completeWithNvidia } from './nvidiaClient';
import { parseJsonResponse } from './extractJson';
import { resolveProvider } from './types';

export interface ThemeScoreInput {
  sourceUrl: string;
  headline: string;
  articleBody: string;
  articleFacts: string[];
}

export interface BrandContext {
  positioning: string;
  targetAudience: string;
  coreProblem: string;
  promise: string;
  offerDescription: string;
  tone: string;
}

export interface LeadMagnetOption {
  ctaKeyword: string;
  name: string;
  description: string;
}

// Weights from the briefing: audience fit 25, business impact 20, hook
// potential 15, evidence quality 15, offer/lead-magnet bridge 15, novelty
// 10 — sums to 100. The AI supplies each 0-100 subscore; totalScore is
// always computed here, never trusted from the model's own arithmetic.
const SCORE_WEIGHTS = {
  audienceFitScore: 0.25,
  businessImpactScore: 0.2,
  hookPotentialScore: 0.15,
  evidenceQualityScore: 0.15,
  offerBridgeScore: 0.15,
  noveltyScore: 0.1,
} as const;

const themeAssessmentSchema = z.object({
  audienceFitScore: z.number().int().min(0).max(100),
  businessImpactScore: z.number().int().min(0).max(100),
  hookPotentialScore: z.number().int().min(0).max(100),
  evidenceQualityScore: z.number().int().min(0).max(100),
  offerBridgeScore: z.number().int().min(0).max(100),
  noveltyScore: z.number().int().min(0).max(100),
  contentPillar: z.enum(['radar', 'blueprint', 'diagnostic', 'proof']),
  funnelStage: z.enum(['awareness', 'consideration', 'conversion']),
  postGoal: z.enum(['follow', 'save_share', 'comment_dm', 'offer']),
  targetPain: z.string().trim().min(1),
  businessApplication: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  strategicRationale: z.string().trim().min(1),
  recommendedLeadMagnetKeyword: z.string().trim().min(1).nullable(),
  hookVariants: z.array(z.string().trim().min(1)).length(3),
});

type ThemeAssessment = z.infer<typeof themeAssessmentSchema>;

export type ThemeScore = ThemeAssessment & { hook: string; totalScore: number };

function computeTotalScore(assessment: ThemeAssessment): number {
  const weighted =
    assessment.audienceFitScore * SCORE_WEIGHTS.audienceFitScore +
    assessment.businessImpactScore * SCORE_WEIGHTS.businessImpactScore +
    assessment.hookPotentialScore * SCORE_WEIGHTS.hookPotentialScore +
    assessment.evidenceQualityScore * SCORE_WEIGHTS.evidenceQualityScore +
    assessment.offerBridgeScore * SCORE_WEIGHTS.offerBridgeScore +
    assessment.noveltyScore * SCORE_WEIGHTS.noveltyScore;
  return Math.round(weighted);
}

function buildPrompt(theme: ThemeScoreInput, brand: BrandContext, leadMagnets: LeadMagnetOption[]): string {
  return [
    loadDesignSystem(),
    '',
    '## Posicionamento da marca',
    `Público: ${brand.targetAudience}`,
    `Problema central: ${brand.coreProblem}`,
    `Promessa: ${brand.promise}`,
    `Oferta futura: ${brand.offerDescription}`,
    `Tom: ${brand.tone}`,
    '',
    '## Materiais complementares disponíveis (lead magnets)',
    leadMagnets.length > 0
      ? leadMagnets.map((magnet) => `- ${magnet.ctaKeyword}: ${magnet.name} — ${magnet.description}`).join('\n')
      : '(nenhum cadastrado)',
    '',
    '## Artigo-fonte',
    `Manchete: ${theme.headline}`,
    `URL: ${theme.sourceUrl}`,
    'Corpo extraído (use SOMENTE estas informações, nunca invente dado ausente):',
    theme.articleBody,
    '',
    'Fatos/números extraídos do corpo:',
    theme.articleFacts.length > 0 ? theme.articleFacts.map((fact) => `- ${fact}`).join('\n') : '(nenhum fato numérico identificado)',
    '',
    'Avalie este tema para virar um carrossel de Instagram, dando notas de',
    '0 a 100 para cada critério: audienceFitScore (aderência ao público',
    'comprador), businessImpactScore (impacto empresarial),',
    'hookPotentialScore (potencial de gancho), evidenceQualityScore',
    '(qualidade das evidências no artigo), offerBridgeScore (quão bem o',
    'tema conecta com a oferta/lead magnet), noveltyScore (novidade).',
    'Não escolha apenas o tema mais popular — priorize o que permite',
    'demonstrar aplicação, risco, economia, receita ou vantagem',
    'operacional para o público comprador.',
    '',
    'Responda SOMENTE com um objeto JSON com os campos: audienceFitScore,',
    'businessImpactScore, hookPotentialScore, evidenceQualityScore,',
    'offerBridgeScore, noveltyScore (números 0-100), contentPillar (um de',
    '"radar", "blueprint", "diagnostic", "proof"), funnelStage (um de',
    '"awareness", "consideration", "conversion"), postGoal (um de "follow",',
    '"save_share", "comment_dm", "offer"), targetPain (texto), ',
    'businessApplication (texto), angle (texto), strategicRationale',
    '(texto), recommendedLeadMagnetKeyword (uma das ctaKeyword acima, ou',
    'null se nenhuma se aplica), hookVariants (array com exatamente 3',
    'ganchos curtos em texto puro, sem HTML/markdown).',
  ].join('\n');
}

export async function scoreTheme(
  theme: ThemeScoreInput,
  brand: BrandContext,
  leadMagnets: LeadMagnetOption[] = [],
): Promise<ThemeScore> {
  const provider = resolveProvider('THEME_SUGGESTION');
  const prompt = buildPrompt(theme, brand, leadMagnets);
  const raw = provider === 'nvidia' ? await completeWithNvidia(prompt) : await completeWithClaude(prompt);
  const assessment = parseJsonResponse(raw, themeAssessmentSchema, 'scoreTheme');

  return {
    ...assessment,
    hook: assessment.hookVariants[0] ?? '',
    totalScore: computeTotalScore(assessment),
  };
}
