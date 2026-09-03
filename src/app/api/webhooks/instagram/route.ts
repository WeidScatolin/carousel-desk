import { timingSafeEqual } from 'node:crypto';
import { processCommentEvent } from '@/lib/pipeline/processCommentEvent';
import { verifyMetaSignature } from '@/lib/leads/webhookSignature';

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Webhook verification handshake — Meta calls this once when the
// subscription is configured/re-verified.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (mode !== 'subscribe' || !expectedToken || !token || !timingSafeStringEqual(token, expectedToken) || !challenge) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

// A single "comments" webhook change, per the Instagram Webhooks
// Reference (developers.facebook.com/docs/graph-api/webhooks/reference/instagram,
// researched in-session 2026-09-03): value.id is the comment id,
// value.media.id the media it was posted on, value.from.{id,username}
// the commenter, value.text the comment body.
interface CommentChangeValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}

interface WebhookEntry {
  changes?: Array<{ field?: string; value?: CommentChangeValue }>;
}

interface WebhookPayload {
  entry?: WebhookEntry[];
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const signature = request.headers.get('x-hub-signature-256');

  if (!appSecret || !verifyMetaSignature(rawBody, signature, appSecret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Not our fault to diagnose further — acknowledge so Meta doesn't retry
    // a payload that will never parse.
    return Response.json({ ok: true }, { status: 200 });
  }

  const commentChanges = (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === 'comments' && change.value?.id && change.value?.media?.id);

  for (const change of commentChanges) {
    const value = change.value as Required<Pick<CommentChangeValue, 'id' | 'media'>> & CommentChangeValue;
    await processCommentEvent({
      instagramCommentId: value.id,
      instagramMediaId: value.media.id as string,
      instagramUserId: value.from?.id,
      instagramUsername: value.from?.username,
      originalComment: value.text ?? '',
    });
  }

  return Response.json({ ok: true }, { status: 200 });
}
