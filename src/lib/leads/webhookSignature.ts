import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

// Meta webhook signature verification: X-Hub-Signature-256 carries
// "sha256=" + hex HMAC-SHA256 of the raw request body, keyed with the
// app secret. Same timing-safe-equal discipline as the discover route's
// bearer-token check in this repo (src/app/api/pipeline/discover/route.ts).
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const providedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const providedBuffer = Buffer.from(providedHex, 'hex');
  const expectedBuffer = Buffer.from(expectedHex, 'hex');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
