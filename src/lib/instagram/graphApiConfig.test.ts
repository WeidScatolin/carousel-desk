import { afterEach, describe, expect, test } from 'vitest';
import {
  getGraphApiBaseUrl,
  getGraphApiVersion,
  getInstagramAccessToken,
  getInstagramBusinessAccountId,
  isPrivateRepliesEnabled,
} from './graphApiConfig';

afterEach(() => {
  delete process.env.META_GRAPH_API_VERSION;
  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  delete process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED;
});

describe('getGraphApiVersion / getGraphApiBaseUrl', () => {
  test('falls back to v26.0 when META_GRAPH_API_VERSION is unset', () => {
    expect(getGraphApiVersion()).toBe('v26.0');
    expect(getGraphApiBaseUrl()).toBe('https://graph.instagram.com/v26.0');
  });

  test('uses the configured version when set', () => {
    process.env.META_GRAPH_API_VERSION = 'v30.0';
    expect(getGraphApiVersion()).toBe('v30.0');
    expect(getGraphApiBaseUrl()).toBe('https://graph.instagram.com/v30.0');
  });

  test('falls back when the env var is only whitespace', () => {
    process.env.META_GRAPH_API_VERSION = '   ';
    expect(getGraphApiVersion()).toBe('v26.0');
  });
});

describe('getInstagramAccessToken', () => {
  test('throws when not configured', () => {
    expect(() => getInstagramAccessToken()).toThrow('INSTAGRAM_ACCESS_TOKEN is not configured');
  });

  test('returns the configured token', () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'token-1';
    expect(getInstagramAccessToken()).toBe('token-1');
  });
});

describe('getInstagramBusinessAccountId', () => {
  test('throws when not configured', () => {
    expect(() => getInstagramBusinessAccountId()).toThrow('INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
  });

  test('returns the configured account id', () => {
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = 'ig-user-1';
    expect(getInstagramBusinessAccountId()).toBe('ig-user-1');
  });
});

describe('isPrivateRepliesEnabled', () => {
  test.each([undefined, 'false', 'TRUE', '1'])('is false for %s', (value) => {
    if (value === undefined) {
      delete process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED;
    } else {
      process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED = value;
    }
    expect(isPrivateRepliesEnabled()).toBe(false);
  });

  test('is true only for the exact string "true"', () => {
    process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED = 'true';
    expect(isPrivateRepliesEnabled()).toBe(true);
  });
});
