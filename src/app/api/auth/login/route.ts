import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCredentials } from '@/lib/auth/credentials';
import { getSession } from '@/lib/auth/session';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isValid = await verifyCredentials(parsed.data.username, parsed.data.password);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  session.username = parsed.data.username;
  await session.save();

  return NextResponse.json({ ok: true }, { status: 200 });
}
