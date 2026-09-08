import { isPipelineAuthorized } from '@/lib/pipeline/auth';
import { discoverThemes } from '@/lib/pipeline/discoverThemes';
import { safeError } from '@/lib/pipeline/state';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!isPipelineAuthorized(request, true)) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await discoverThemes();
    return Response.json({ success: data.failed === 0, data }, { status: data.failed ? 503 : 200 });
  } catch (error) {
    return Response.json({ success: false, error: safeError(error) }, { status: 503 });
  }
}
