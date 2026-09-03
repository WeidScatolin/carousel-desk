export interface InstagramPrivateReplyProvider {
  sendPrivateReply(input: { commentId: string; message: string }): Promise<{
    success: boolean;
    externalMessageId?: string;
    error?: string;
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

const GRAPH_API_BASE_URL = 'https://graph.instagram.com/v21.0';

function getAccessToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MetaPrivateReplyProvider: INSTAGRAM_ACCESS_TOKEN is not configured');
  }
  return token;
}

function getBusinessAccountId(): string {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('MetaPrivateReplyProvider: INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
  }
  return accountId;
}

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
  }> {
    const token = getAccessToken();
    const accountId = getBusinessAccountId();

    try {
      const response = await fetch(`${GRAPH_API_BASE_URL}/${accountId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { comment_id: input.commentId },
          message: { text: input.message },
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        return { success: false, error: `Instagram Graph API private reply failed with ${response.status}: ${body}` };
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return { success: false, error: `Instagram Graph API private reply returned invalid JSON: ${body}` };
      }

      const messageId =
        typeof payload === 'object' && payload !== null && 'message_id' in payload
          ? String((payload as Record<string, unknown>).message_id)
          : undefined;

      return { success: true, externalMessageId: messageId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function getPrivateReplyProvider(): InstagramPrivateReplyProvider {
  return process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED === 'true'
    ? new MetaPrivateReplyProvider()
    : new MockPrivateReplyProvider();
}
