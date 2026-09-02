import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('bcryptjs', () => ({ default: { compare: vi.fn() } }));

import bcrypt from 'bcryptjs';
import { verifyCredentials } from './credentials';

const env = {
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH: 'hashed-password',
} as unknown as NodeJS.ProcessEnv;

describe('verifyCredentials', () => {
  beforeEach(() => {
    vi.mocked(bcrypt.compare).mockReset();
  });

  test('returns true when username matches and password compares successfully', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await verifyCredentials('admin', 'correct-password', env);

    expect(result).toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
  });

  test('returns false when the username does not match', async () => {
    const result = await verifyCredentials('someone-else', 'correct-password', env);

    expect(result).toBe(false);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns false when bcrypt compare fails', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await verifyCredentials('admin', 'wrong-password', env);

    expect(result).toBe(false);
  });

  test('throws when ADMIN_USERNAME or ADMIN_PASSWORD_HASH is not set', async () => {
    await expect(verifyCredentials('admin', 'x', {} as unknown as NodeJS.ProcessEnv)).rejects.toThrow(
      'ADMIN_USERNAME or ADMIN_PASSWORD_HASH is not set'
    );
  });
});
