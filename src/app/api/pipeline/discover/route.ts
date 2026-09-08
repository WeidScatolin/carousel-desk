import { isPipelineAuthorized } from '@/lib/pipeline/auth';
import { discoverThemes } from '@/lib/pipeline/discoverThemes';
import { safeError } from '@/lib/pipeline/state';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if (!isPipelineAuthorized(request, true)) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await discoverThemes();
    const success = data.failed === 0 || data.discovered > 0 || data.busy === true;
    return Response.json({ success, data }, { status: success ? 200 : 503 });
  } catch (error) {
    return Response.json({ success: false, error: safeError(error) }, { status: 503 });
  }
}
