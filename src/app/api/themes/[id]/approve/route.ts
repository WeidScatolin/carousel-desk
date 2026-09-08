import { NextResponse } from 'next/server';
import { safeError } from '@/lib/pipeline/state';
import { prisma } from '@/lib/prisma';
import { generatePostFromTheme } from '@/lib/pipeline/generatePostFromTheme';

// Generous budget: an AI copywriting call (up to 90s) followed by
// per-slide Playwright rendering + Cloudinary uploads for several slides.
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  try {
    const existing = await prisma.post.findFirst({ where: { themeId: id }, orderBy: { createdAt: 'desc' } });
    if (existing) return NextResponse.json({ postId: existing.id });
    const postId = await generatePostFromTheme(id);

    return NextResponse.json({ postId }, { status: 200 });
  } catch (error) {
    const message = safeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
