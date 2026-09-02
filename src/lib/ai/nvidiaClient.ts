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
