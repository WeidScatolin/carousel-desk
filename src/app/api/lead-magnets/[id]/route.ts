import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { leadMagnetSchema } from '@/lib/validation/brandStrategy';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = leadMagnetSchema.partial().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const leadMagnet = await prisma.leadMagnet.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ leadMagnet }, { status: 200 });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  // Post/ContentBrief/LeadMagnetCampaign all reference this via ON DELETE
  // SET NULL, so deleting a lead magnet in use just detaches it from
  // whatever already referenced it rather than failing.
  await prisma.leadMagnet.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { status: 200 });
}
