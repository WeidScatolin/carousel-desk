import { isPipelineAuthorized } from '@/lib/pipeline/auth';
import { acquireStage, finishStage, safeError } from '@/lib/pipeline/state';
import { runAutopilot } from '@/lib/pipeline/autopilot';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!isPipelineAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = await acquireStage('autopilot');
  if (!owner) return Response.json({ busy: true });
  try {
    const counts = await runAutopilot();
    await finishStage('autopilot', owner, counts);
    return Response.json(counts);
  } catch (error) {
    const message = safeError(error);
    await finishStage('autopilot', owner, { failed: 1 }, message);
    return Response.json({ error: message, failed: 1 }, { status: 503 });
  }
}
