// Never print tokens or raw API response bodies.
const stage = process.argv[2];
if (!['discover', 'autopilot', 'publish', 'process-instagram-comments'].includes(stage)) throw new Error('Unknown pipeline stage');
const appUrl = process.env.APP_URL?.replace(/\/$/, '');
const token = process.env.PUBLISH_API_TOKEN;
if (!appUrl || !token) throw new Error('APP_URL and PUBLISH_API_TOKEN must be configured in GitHub');
try {
  const response = await fetch(appUrl + '/api/pipeline/' + stage, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(310_000),
  });
  const body = await response.json();
  const counts = body.data ?? body;
  console.log(JSON.stringify({ stage, httpStatus: response.status,
    ...Object.fromEntries(Object.entries(counts).filter(([, value]) => typeof value === 'number' || typeof value === 'boolean')) }));
  const failed = Number(counts.failed ?? 0);
  const productiveDiscovery = stage === 'discover' && Number(counts.discovered ?? 0) > 0;
  if (!response.ok || body.success === false || (failed > 0 && !productiveDiscovery)) process.exitCode = 1;
} catch {
  console.error('Pipeline request failed or timed out; inspect the operation panel.');
  process.exitCode = 1;
}
