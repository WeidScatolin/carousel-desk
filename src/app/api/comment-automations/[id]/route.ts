import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeKeyword } from '@/lib/leads/normalizeKeyword';
import { isUniqueConstraintViolation } from '@/lib/prismaErrors';
import { updateCommentAutomationSchema } from '@/lib/validation/commentAutomation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = updateCommentAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.status === 'ACTIVE') {
    const automation = await prisma.commentAutomation.findUnique({ where: { id }, include: { post: true } });
    if (!automation) {
      return NextResponse.json({ error: 'Comment automation not found' }, { status: 404 });
    }
    if (automation.post.status !== 'published') {
      return NextResponse.json(
        { error: 'Não é possível ativar: o post não está publicado.' },
        { status: 400 },
      );
    }
  }

  const { keyword, ...rest } = parsed.data;
  const data = keyword !== undefined ? { ...rest, keyword, normalizedKeyword: normalizeKeyword(keyword) } : rest;

  try {
    const automation = await prisma.commentAutomation.update({ where: { id }, data });
    return NextResponse.json({ automation }, { status: 200 });
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
