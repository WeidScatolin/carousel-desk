export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetchHtml: request to ${url} failed with status ${response.status}`);
  }
  return response.text();
}
