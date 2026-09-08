import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { readinessIssues } from '@/lib/pipeline/readiness';

const schema = z.object({
  enabled: z.boolean(), dailyPostLimit: z.number().int().min(1).max(3),
  publishHourUtc: z.number().int().min(0).max(23), minThemeScore: z.number().int().min(0).max(100),
  autoCommentReplies: z.boolean(),
});

export async function PATCH(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: 'Confira os limites e horários.' }, { status: 400 });
  if (parsed.data.enabled || parsed.data.autoCommentReplies) {
    const issues = await readinessIssues(parsed.data.autoCommentReplies);
    if (issues.length) return Response.json({ error: issues.join(' ') }, { status: 422 });
  }
  const settings = await prisma.automationSettings.upsert({
    where: { id: 'default' }, create: { id: 'default', ...parsed.data }, update: parsed.data,
  });
  return Response.json({ settings });
}
