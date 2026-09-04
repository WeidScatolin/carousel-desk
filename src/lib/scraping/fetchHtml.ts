// No timeout here previously meant a slow/unresponsive source (bot
// protection silently holding the connection open, a network hiccup)
// could hang until the *platform's* function timeout killed the whole
// invocation — indistinguishable from every other kind of failure and
// far slower to surface than necessary. This fails fast and clearly.
const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`fetchHtml: request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`fetchHtml: request to ${url} failed with status ${response.status}`);
  }
  return response.text();
}
