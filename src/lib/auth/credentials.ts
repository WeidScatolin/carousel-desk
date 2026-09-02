import bcrypt from 'bcryptjs';

export async function verifyCredentials(
  username: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  const expectedUsername = env.ADMIN_USERNAME;
  const expectedPasswordHash = env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !expectedPasswordHash) {
    throw new Error('ADMIN_USERNAME or ADMIN_PASSWORD_HASH is not set');
  }

  if (username !== expectedUsername) {
    return false;
  }

  return bcrypt.compare(password, expectedPasswordHash);
}
