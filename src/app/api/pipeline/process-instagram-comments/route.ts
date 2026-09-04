import { fetchAllComments, type InstagramComment } from '@/lib/instagram/fetchComments';
import { composeReplyMessage, deliverCommentReply } from '@/lib/leads/deliverCommentReply';
import { matchesKeyword } from '@/lib/leads/matchKeyword';
import { normalizeKeyword } from '@/lib/leads/normalizeKeyword';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintViolation } from '@/lib/prismaErrors';
import type { CommentAutomation } from '@/generated/prisma/client';

interface Counts {
  postsChecked: number;
  commentsFound: number;
  newComments: number;
  matched: number;
  simulated: number;
  sent: number;
  ignored: number;
  failed: number;
}

function emptyCounts(postsChecked: number): Counts {
  return { postsChecked, commentsFound: 0, newComments: 0, matched: 0, simulated: 0, sent: 0, ignored: 0, failed: 0 };
}

function authorized(request: Request): boolean {
  const expectedToken = process.env.PUBLISH_API_TOKEN;
  const authorization = request.headers.get('authorization');
  return Boolean(expectedToken) && authorization === `Bearer ${expectedToken}`;
}

function groupByMedia(automations: CommentAutomation[]): Map<string, CommentAutomation[]> {
  const groups = new Map<string, CommentAutomation[]>();
  for (const automation of automations) {
    const existing = groups.get(automation.instagramMediaId);
    if (existing) {
      existing.push(automation);
    } else {
      groups.set(automation.instagramMediaId, [automation]);
    }
  }
  return groups;
}

interface MatchResult {
  chosen: CommentAutomation | null;
  conflicts: CommentAutomation[];
}

// automations arrive ordered by createdAt asc (the caller's query), so the
// first match is the deterministic priority winner; the rest are recorded
// as a conflict rather than silently dropped.
function pickMatch(comment: InstagramComment, automations: CommentAutomation[]): MatchResult {
  const matches = automations.filter((automation) => matchesKeyword(comment.text, automation.keyword, automation.matchMode));
  return { chosen: matches[0] ?? null, conflicts: matches.slice(1) };
}

async function claimDelivery(
  mediaId: string,
  comment: InstagramComment,
  automation: CommentAutomation,
  conflictNote: string | null,
) {
  try {
    return await prisma.commentDelivery.create({
      data: {
        automationId: automation.id,
        instagramCommentId: comment.id,
        instagramMediaId: mediaId,
        instagramUsername: comment.username,
        originalComment: comment.text,
        normalizedComment: normalizeKeyword(comment.text),
        status: 'PROCESSING',
        lastError: conflictNote,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      // Another concurrent run claimed this comment between our
      // dedup check and this create() — not an error, just a lost race.
      return null;
    }
    throw error;
  }
}

async function processComment(mediaId: string, comment: InstagramComment, automations: CommentAutomation[], counts: Counts): Promise<void> {
  const existing = await prisma.commentDelivery.findUnique({ where: { instagramCommentId: comment.id }, select: { id: true } });
  if (existing) {
    return;
  }
  counts.newComments += 1;

  const { chosen, conflicts } = pickMatch(comment, automations);
  if (!chosen) {
    counts.ignored += 1;
    return;
  }
  counts.matched += 1;

  const conflictNote =
    conflicts.length > 0 ? `Conflito: o comentário também combina com a(s) automação(ões) ${conflicts.map((a) => a.id).join(', ')}.` : null;
  const delivery = await claimDelivery(mediaId, comment, chosen, conflictNote);
  if (!delivery) {
    return;
  }

  const outcome = await deliverCommentReply(comment.id, composeReplyMessage(chosen));
  await prisma.commentDelivery.update({
    where: { id: delivery.id },
    data: {
      status: outcome.status,
      externalMessageId: outcome.externalMessageId,
      lastError: outcome.lastError ?? conflictNote,
      deliveredAt: outcome.status === 'FAILED' ? null : new Date(),
    },
  });

  if (outcome.status === 'SIMULATED') counts.simulated += 1;
  else if (outcome.status === 'SENT') counts.sent += 1;
  else counts.failed += 1;
}

async function processMedia(mediaId: string, automations: CommentAutomation[], counts: Counts): Promise<void> {
  let comments: InstagramComment[];
  try {
    comments = await fetchAllComments(mediaId);
  } catch {
    // A single media failing to fetch (rate limit, transient error, bad
    // token) should not fail the whole run — the next scheduled poll
    // retries it naturally. Nothing to record: no comment was seen.
    return;
  }
  counts.commentsFound += comments.length;
  for (const comment of comments) {
    await processComment(mediaId, comment, automations, counts);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const automations = await prisma.commentAutomation.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  const groups = groupByMedia(automations);
  const counts = emptyCounts(groups.size);

  for (const [mediaId, mediaAutomations] of groups) {
    await processMedia(mediaId, mediaAutomations, counts);
  }

  return Response.json(counts);
}
