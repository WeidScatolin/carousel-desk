import { describe, test, expect } from 'vitest';
import { getSessionOptions, SESSION_COOKIE_NAME } from './session';

describe('getSessionOptions', () => {
  test('builds session options from SESSION_SECRET', () => {
    const options = getSessionOptions({
      SESSION_SECRET: 'a'.repeat(32),
      NODE_ENV: 'development',
    } as unknown as NodeJS.ProcessEnv);

    expect(options.cookieName).toBe(SESSION_COOKIE_NAME);
    expect(options.password).toBe('a'.repeat(32));
    expect(options.cookieOptions?.secure).toBe(false);
  });

  test('marks the cookie secure in production', () => {
    const options = getSessionOptions({
      SESSION_SECRET: 'a'.repeat(32),
      NODE_ENV: 'production',
    } as unknown as NodeJS.ProcessEnv);

    expect(options.cookieOptions?.secure).toBe(true);
  });

  test('throws when SESSION_SECRET is not set', () => {
    expect(() => getSessionOptions({} as unknown as NodeJS.ProcessEnv)).toThrow('SESSION_SECRET is not set');
  });
});
