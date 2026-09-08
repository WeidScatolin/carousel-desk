export interface InstagramPrivateReplyProvider {
  sendPrivateReply(input: { commentId: string; message: string }): Promise<{
    success: boolean;
    externalMessageId?: string;
    error?: string;
    uncertain?: boolean;
  }>;
}

// Never makes a network call. Default provider — used whenever
// INSTAGRAM_PRIVATE_REPLIES_ENABLED is not exactly 'true'.
export class MockPrivateReplyProvider implements InstagramPrivateReplyProvider {
  async sendPrivateReply(input: { commentId: string; message: string }): Promise<{
    success: boolean;
    externalMessageId?: string;
  }> {
    return { success: true, externalMessageId: `simulated-${input.commentId}` };
  }
}

import { getGraphApiBaseUrl, getInstagramAccessToken, getInstagramBusinessAccountId, isPrivateRepliesEnabled } from '../instagram/graphApiConfig';

// UNVERIFIED against a live Meta app — implemented from current published
// docs, researched in-session (2026-09-03):
//   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies
// which documents, for the "Instagram API with Instagram Login" flow this
// project already uses (graph.instagram.com, no linked Facebook Page —
// see src/lib/instagram/publishCarousel.ts for the same flow's carousel
// publish calls): POST /<ig-user-id>/messages with body
// { recipient: { comment_id }, message: { text } }, permission
// "instagram_business_manage_comments". A second Meta doc page describes
// an alternate shorthand form, POST /<comment-id>/private_replies — that
// alternate was NOT used here because the messages-endpoint page gave a
// complete, structured answer matching this project's login flow, while
// the shorthand page did not. Confirm the exact endpoint/permission
// against the live Meta App Dashboard for this app before setting
// INSTAGRAM_PRIVATE_REPLIES_ENABLED=true in production.
export class MetaPrivateReplyProvider implements InstagramPrivateReplyProvider {
  async sendPrivateReply(input: { commentId: string; message: string }): Promise<{
    success: boolean;
    externalMessageId?: string;
    error?: string;
    uncertain?: boolean;
  }> {
    let token: string;
    let accountId: string;
    try { token = getInstagramAccessToken(); accountId = getInstagramBusinessAccountId(); }
    catch { return { success: false, error: 'Instagram credentials are not configured' }; }
    try {
      const response = await fetch(getGraphApiBaseUrl() + '/' + accountId + '/messages', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ recipient: { comment_id: input.commentId }, message: { text: input.message } }),
      });
      if (!response.ok) {
        return { success: false, uncertain: response.status >= 500,
          error: 'Instagram private reply rejected (HTTP ' + response.status + ')' };
      }
      const payload: unknown = await response.json();
      const id = typeof payload === 'object' && payload !== null && 'message_id' in payload ? payload.message_id : null;
      if (typeof id !== 'string' || !id) return { success: false, uncertain: true, error: 'Instagram returned no message ID; verify before retrying' };
      return { success: true, externalMessageId: id };
    } catch {
      return { success: false, uncertain: true, error: 'Private reply outcome unavailable; verify before retrying' };
    }
  }
}

export function getPrivateReplyProvider(): InstagramPrivateReplyProvider {
  return isPrivateRepliesEnabled() ? new MetaPrivateReplyProvider() : new MockPrivateReplyProvider();
}
