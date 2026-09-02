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
