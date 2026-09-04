import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeKeyword } from '@/lib/leads/normalizeKeyword';
import { isUniqueConstraintViolation } from '@/lib/prismaErrors';
import { createCommentAutomationSchema } from '@/lib/validation/commentAutomation';

export async function GET(): Promise<NextResponse> {
  const automations = await prisma.commentAutomation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { post: { select: { id: true, instagramPostId: true, status: true, caption: true } } },
  });
  return NextResponse.json({ automations }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json();
  const parsed = createCommentAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const post = await prisma.post.findUnique({ where: { id: parsed.data.postId } });
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }
  if (post.status !== 'published' || !post.instagramPostId) {
    return NextResponse.json(
      { error: 'O post precisa estar publicado no Instagram para receber uma automação.' },
      { status: 400 },
    );
  }

  try {
    const automation = await prisma.commentAutomation.create({
      data: {
        postId: post.id,
        instagramMediaId: post.instagramPostId,
        keyword: parsed.data.keyword,
        normalizedKeyword: normalizeKeyword(parsed.data.keyword),
        matchMode: parsed.data.matchMode,
        replyMessage: parsed.data.replyMessage,
        assetUrl: parsed.data.assetUrl ?? null,
      },
    });
    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return NextResponse.json(
        { error: 'Já existe uma automação com essa palavra-chave para este post.' },
        { status: 409 },
      );
    }
    throw error;
  }
}
