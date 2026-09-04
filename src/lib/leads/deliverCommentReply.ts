import { isPrivateRepliesEnabled } from '../instagram/graphApiConfig';
import { getPrivateReplyProvider } from './privateReplyProvider';

export interface ReplyOutcome {
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  externalMessageId: string | null;
  lastError: string | null;
}

export function composeReplyMessage(automation: { replyMessage: string; assetUrl: string | null }): string {
  return automation.assetUrl ? `${automation.replyMessage}\n${automation.assetUrl}` : automation.replyMessage;
}

// Shared by the polling processor and the admin "reprocess" action so both
// paths record SENT/SIMULATED/FAILED the same way. The mock provider
// (feature flag off) always reports success — status is still SIMULATED,
// never SENT, so a flag flip can't be mistaken for a real delivery in the
// data by whoever reads CommentDelivery.status afterwards.
export async function deliverCommentReply(commentId: string, message: string): Promise<ReplyOutcome> {
  const provider = getPrivateReplyProvider();
  const result = await provider.sendPrivateReply({ commentId, message });

  if (!isPrivateRepliesEnabled()) {
    return { status: 'SIMULATED', externalMessageId: result.externalMessageId ?? null, lastError: null };
  }
  if (result.success) {
    return { status: 'SENT', externalMessageId: result.externalMessageId ?? null, lastError: null };
  }
  return { status: 'FAILED', externalMessageId: null, lastError: result.error ?? 'unknown error' };
}
