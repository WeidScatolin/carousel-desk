import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { verifyMetaSignature } from './webhookSignature';

const APP_SECRET = 'test-app-secret';

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyMetaSignature', () => {
  test('returns true for a valid signature', () => {
    const body = JSON.stringify({ entry: [] });
    expect(verifyMetaSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  test('returns false when the body was tampered with after signing', () => {
    const originalBody = JSON.stringify({ entry: [] });
    const signature = sign(originalBody);
    const tamperedBody = JSON.stringify({ entry: ['injected'] });

    expect(verifyMetaSignature(tamperedBody, signature, APP_SECRET)).toBe(false);
  });

  test('returns false when the header is missing', () => {
    expect(verifyMetaSignature('{}', null, APP_SECRET)).toBe(false);
  });

  test('returns false when the header is malformed (no sha256= prefix)', () => {
    const body = '{}';
    const rawHex = createHmac('sha256', APP_SECRET).update(body).digest('hex');
    expect(verifyMetaSignature(body, rawHex, APP_SECRET)).toBe(false);
  });

  test('returns false when signed with the wrong secret', () => {
    const body = '{}';
    expect(verifyMetaSignature(body, sign(body, 'wrong-secret'), APP_SECRET)).toBe(false);
  });
});
