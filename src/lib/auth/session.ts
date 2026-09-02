import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';

export interface SessionData {
  isLoggedIn: boolean;
  username?: string;
}

export const SESSION_COOKIE_NAME = 'carousel-desk-session';

export function getSessionOptions(env: NodeJS.ProcessEnv = process.env): SessionOptions {
  const password = env.SESSION_SECRET;
  if (!password) {
    throw new Error('SESSION_SECRET is not set');
  }

  return {
    cookieName: SESSION_COOKIE_NAME,
    password,
    cookieOptions: { secure: env.NODE_ENV === 'production' },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}
