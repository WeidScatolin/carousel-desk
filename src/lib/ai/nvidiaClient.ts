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

// NVIDIA renames/retires catalog models without warning — a stale model
// id doesn't 404, it 410s with no body, which is opaque to debug. This
// checks the live catalog before every real call (cached briefly so a
// burst of calls doesn't re-list every time) so a retired model fails
// loudly and immediately instead of as a cryptic transport error.
let cachedModelIds: Set<string> | null = null;
let cachedAt = 0;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

async function getAvailableModelIds(openai: OpenAI): Promise<Set<string>> {
  const now = Date.now();
  if (cachedModelIds && now - cachedAt < MODEL_CACHE_TTL_MS) {
    return cachedModelIds;
  }
  const models = await openai.models.list();
  cachedModelIds = new Set(models.data.map((entry) => entry.id));
  cachedAt = now;
  return cachedModelIds;
}

async function assertModelAvailable(openai: OpenAI, model: string): Promise<void> {
  const availableModelIds = await getAvailableModelIds(openai);
  if (!availableModelIds.has(model)) {
    throw new Error(
      `completeWithNvidia: model "${model}" is not in NVIDIA's current catalog — it was likely renamed or retired. Check https://integrate.api.nvidia.com/v1/models and update the default model in nvidiaClient.ts.`,
    );
  }
}

export async function completeWithNvidia(
  prompt: string,
  model = 'openai/gpt-oss-20b'
): Promise<string> {
  const openai = getClient();
  await assertModelAvailable(openai, model);

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
