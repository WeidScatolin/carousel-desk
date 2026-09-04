import type { z } from 'zod';

// AI providers — especially NVIDIA, which has no native JSON-mode — often
// wrap the JSON payload in prose ("Here is the analysis:\n\n{...}\n\nLet
// me know..."). This scans for the first balanced {...} or [...] block,
// respecting string literals and escapes, instead of assuming the whole
// response is JSON.
export function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const firstBracketIndex = trimmed.search(/[[{]/);
  if (firstBracketIndex === -1) {
    throw new Error(`extractJsonBlock: no JSON object or array found in response: ${raw}`);
  }

  const openChar = trimmed[firstBracketIndex];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = firstBracketIndex; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(firstBracketIndex, i + 1);
      }
    }
  }

  throw new Error(`extractJsonBlock: unbalanced JSON in response: ${raw}`);
}

// Extracts, parses and validates a provider response in one step, with an
// error message that names which call produced the bad response.
export function parseJsonResponse<T>(raw: string, schema: z.ZodType<T>, context: string): T {
  let block: string;
  try {
    block = extractJsonBlock(raw);
  } catch {
    throw new Error(`${context}: provider response was not valid JSON: ${raw}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    throw new Error(`${context}: provider response was not valid JSON: ${raw}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}
