import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const name of ['PUBLISH_API_TOKEN', 'DISCOVERY_API_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'NVIDIA_API_KEY',
    'ANTHROPIC_API_KEY', 'CLOUDINARY_API_SECRET', 'DATABASE_URL', 'SESSION_SECRET']) {
    const secret = process.env[name];
    if (secret && secret.length >= 6) message = message.split(secret).join('[redacted]');
  }
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(access_token|api_key|token)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s]+/g, '[URL]').slice(0, 800);
}

// Ownership is checked on release: a late invocation cannot clear a newer
// worker's lease. External publication has its own persisted checkpoints.
export async function acquireStage(stage: string): Promise<string | null> {
  await prisma.pipelineState.upsert({ where: { stage }, create: { stage }, update: {} });
  const owner = randomUUID();
  const now = new Date();
  const claimed = await prisma.pipelineState.updateMany({
    where: { stage, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + 10 * 60_000), lastStartedAt: now },
  });
  return claimed.count === 1 ? owner : null;
}

export async function finishStage(stage: string, owner: string, counts: Record<string, number>, error?: string): Promise<void> {
  const now = new Date();
  await prisma.pipelineState.updateMany({
    where: { stage, leaseOwner: owner },
    data: { leaseOwner: null, leaseUntil: null, lastFinishedAt: now,
      ...(error ? {} : { lastSuccessAt: now }), lastError: error ?? null, counts },
  });
}
