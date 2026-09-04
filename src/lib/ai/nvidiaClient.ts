// Raw fetch, not the `openai` SDK client: the SDK's default request
// timeout is measured in minutes, with no short client-level cap
// configured here — a slow/hanging response (confirmed NOT the case for
// direct fetch calls to this same endpoint/key, tested independently)
// would hang the whole serverless invocation until the *platform*
// killed it, indistinguishable from every other kind of failure.
const REQUEST_TIMEOUT_MS = 20_000;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

function getApiKey(): string {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not set');
  }
  return apiKey;
}

async function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${NVIDIA_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`completeWithNvidia: request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// NVIDIA renames/retires catalog models without warning — a stale model
// id doesn't 404, it 410s with no body, which is opaque to debug. This
// checks the live catalog before every real call (cached briefly so a
// burst of calls doesn't re-list every time) so a retired model fails
// loudly and immediately instead of as a cryptic transport error.
let cachedModelIds: Set<string> | null = null;
let cachedAt = 0;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

async function getAvailableModelIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedModelIds && now - cachedAt < MODEL_CACHE_TTL_MS) {
    return cachedModelIds;
  }
  const response = await fetchWithTimeout('/models', {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  if (!response.ok) {
    throw new Error(`completeWithNvidia: listing models failed with ${response.status}`);
  }
  const body = (await response.json()) as { data: { id: string }[] };
  cachedModelIds = new Set(body.data.map((entry) => entry.id));
  cachedAt = now;
  return cachedModelIds;
}

async function assertModelAvailable(model: string): Promise<void> {
  const availableModelIds = await getAvailableModelIds();
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
  await assertModelAvailable(model);

  const response = await fetchWithTimeout('/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`completeWithNvidia: request failed with ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as { choices: { message: { content: string | null } }[] };
  const content = payload.choices[0]?.message?.content;
  if (!content) {
    throw new Error('NVIDIA response contained no content');
  }

  return content;
}
