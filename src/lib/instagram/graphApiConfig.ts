// Central place for every Instagram Graph API call to get its base URL,
// access token and business account id. Before this existed,
// publishCarousel.ts and privateReplyProvider.ts each hardcoded
// "https://graph.instagram.com/v21.0" independently — bumping the API
// version meant editing both (and missing the next new caller).
const DEFAULT_GRAPH_API_VERSION = 'v26.0';

export function getGraphApiVersion(): string {
  const configured = process.env.META_GRAPH_API_VERSION?.trim();
  return configured || DEFAULT_GRAPH_API_VERSION;
}

export function getGraphApiBaseUrl(): string {
  return `https://graph.instagram.com/${getGraphApiVersion()}`;
}

export function getInstagramAccessToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN is not configured');
  }
  return token;
}

export function getInstagramBusinessAccountId(): string {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
  }
  return accountId;
}

export function isPrivateRepliesEnabled(): boolean {
  return process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED === 'true';
}
