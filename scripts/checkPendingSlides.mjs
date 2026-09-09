import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function checkPendingSlides(env = process.env, fetchImpl = fetch) {
  const appUrl = env.APP_URL?.replace(/\/$/, '');
  const token = env.PUBLISH_API_TOKEN;
  if (!appUrl || !token) {
    throw new Error('APP_URL and PUBLISH_API_TOKEN must be configured in GitHub');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetchImpl(appUrl + '/api/pipeline/pending-slides', {
      headers: { Authorization: 'Bearer ' + token },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error('Pending slide lookup failed');
  }
  const body = await response.json();
  const count = Array.isArray(body.slides) ? body.slides.length : 0;
  console.log(`pendingSlides: ${count} slide(s) awaiting render`);
  if (env.GITHUB_OUTPUT) {
    await appendFile(env.GITHUB_OUTPUT, `count=${count}\n`, 'utf8');
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkPendingSlides();
  } catch {
    console.error('Pending slide lookup failed; inspect the operation panel.');
    process.exitCode = 1;
  }
}
