import { NextResponse, type NextRequest } from 'next/server';
import { unsealData } from 'iron-session';
import { SESSION_COOKIE_NAME, type SessionData } from '@/lib/auth/session';

const PUBLIC_ADMIN_PATHS = ['/admin/login'];
const PROTECTED_API_PREFIXES = ['/api/themes/', '/api/posts/', '/api/slides/'];

async function isRequestAuthenticated(request: NextRequest): Promise<boolean> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const password = process.env.SESSION_SECRET;

  if (!cookieValue || !password) {
    return false;
  }

  try {
    const session = await unsealData<SessionData>(cookieValue, { password });
    return session.isLoggedIn === true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isProtectedPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.includes(pathname);
  const isProtectedApi = PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  const authenticated = await isRequestAuthenticated(request);
  if (authenticated) {
    return NextResponse.next();
  }

  if (isProtectedApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/api/themes/:path*', '/api/posts/:path*', '/api/slides/:path*'],
};
