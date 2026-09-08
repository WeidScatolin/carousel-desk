import { timingSafeEqual } from 'node:crypto';

// A single existing service credential drives all pipeline stages. The
// discovery-only credential remains valid only for its original endpoint.
export function isPipelineAuthorized(request: Request, allowLegacyDiscovery = false): boolean {
  const provided = request.headers.get('authorization');
  if (!provided?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(provided.slice(7));
  const candidates = [process.env.PUBLISH_API_TOKEN];
  if (allowLegacyDiscovery) candidates.push(process.env.DISCOVERY_API_TOKEN);
  return candidates.some((token) => {
    if (!token) return false;
    const expected = Buffer.from(token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
