import { getGraphApiBaseUrl, getInstagramAccessToken } from './graphApiConfig';

export interface InstagramComment {
  id: string;
  text: string;
  username: string | null;
  timestamp: string;
}

// Thrown for HTTP 429 so callers can back off that media without failing
// the whole polling run (the next scheduled run tries again naturally —
// there is no retry/backoff logic in this project by design).
export class InstagramRateLimitError extends Error {}

// Thrown for an expired/invalid token (400/401 with an OAuth error code)
// so callers can distinguish "nothing to do" from "reconfigure the app".
export class InstagramAuthError extends Error {}

const REQUEST_TIMEOUT_MS = 10_000;
const COMMENTS_PAGE_LIMIT = 50;
// Safety cap so a pathological `paging.next` loop can never spin forever.
const MAX_PAGES = 20;

interface GraphErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as GraphErrorBody;
    return parsed.error?.message ?? body;
  } catch {
    return body;
  }
}

function isAuthErrorBody(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as GraphErrorBody;
    // 190 = OAuthException (expired/invalid token) in the Graph API.
    return parsed.error?.code === 190 || parsed.error?.type === 'OAuthException';
  } catch {
    return false;
  }
}

interface CommentsPage {
  data: InstagramComment[];
  after: string | null;
}

function parseCommentsPage(payload: unknown): CommentsPage {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error('Instagram Graph API comments returned an unexpected response shape');
  }
  const rawData = (payload as Record<string, unknown>).data;
  if (!Array.isArray(rawData)) {
    throw new Error('Instagram Graph API comments returned an unexpected response shape');
  }
  const data = rawData.map((item): InstagramComment => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id),
      text: typeof record.text === 'string' ? record.text : '',
      username: typeof record.username === 'string' ? record.username : null,
      timestamp: typeof record.timestamp === 'string' ? record.timestamp : '',
    };
  });
  const paging = (payload as Record<string, unknown>).paging as Record<string, unknown> | undefined;
  const cursors = paging?.cursors as Record<string, unknown> | undefined;
  const after = paging?.next && typeof cursors?.after === 'string' ? cursors.after : null;
  return { data, after };
}

async function fetchCommentsPage(instagramMediaId: string, after: string | null): Promise<CommentsPage> {
  const params = new URLSearchParams({
    fields: 'id,text,username,timestamp',
    limit: String(COMMENTS_PAGE_LIMIT),
    access_token: getInstagramAccessToken(),
  });
  if (after) {
    params.set('after', after);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${getGraphApiBaseUrl()}/${instagramMediaId}/comments?${params.toString()}`, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Instagram Graph API comments request timed out');
    }
    throw new Error('Instagram Graph API comments request failed');
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();

  if (response.status === 429) {
    throw new InstagramRateLimitError('Instagram Graph API comments request was rate limited');
  }
  if (!response.ok) {
    const message = extractErrorMessage(body);
    if (isAuthErrorBody(body)) {
      throw new InstagramAuthError(`Instagram Graph API comments request failed: ${message}`);
    }
    throw new Error(`Instagram Graph API comments request failed with ${response.status}: ${message}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('Instagram Graph API comments returned invalid JSON');
  }
  return parseCommentsPage(payload);
}

// Fetches every comment on a media, following pagination. Query only
// media ids that have active automations — callers decide that.
export async function fetchAllComments(instagramMediaId: string): Promise<InstagramComment[]> {
  const comments: InstagramComment[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchCommentsPage(instagramMediaId, after);
    comments.push(...result.data);
    if (!result.after) {
      break;
    }
    after = result.after;
  }
  return comments;
}
