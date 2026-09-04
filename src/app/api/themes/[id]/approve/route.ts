import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePostFromTheme } from '@/lib/pipeline/generatePostFromTheme';

// Generous budget: an AI copywriting call (up to 90s) followed by
// per-slide Playwright rendering + Cloudinary uploads for several slides.
export const maxDuration = 180;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  try {
    await prisma.theme.update({ where: { id }, data: { status: 'approved' } });
    const postId = await generatePostFromTheme(id);

    return NextResponse.json({ postId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
