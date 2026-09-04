import { getGraphApiBaseUrl, getInstagramAccessToken } from './graphApiConfig';

interface GraphIdResponse {
  id: string;
}

function parseId(payload: unknown, operation: string): GraphIdResponse {
  if (typeof payload !== 'object' || payload === null || !('id' in payload)) {
    throw new Error(`Instagram Graph API ${operation} returned no id`);
  }
  const id = (payload as Record<string, unknown>).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`Instagram Graph API ${operation} returned an invalid id`);
  }
  return { id };
}

async function postForm(
  path: string,
  form: URLSearchParams,
  operation: string
): Promise<GraphIdResponse> {
  const response = await fetch(`${getGraphApiBaseUrl()}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Instagram Graph API ${operation} failed with ${response.status}: ${body}`
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Instagram Graph API ${operation} returned invalid JSON: ${body}`);
  }
  return parseId(payload, operation);
}

async function createItemContainer(
  accountId: string,
  imageUrl: string,
  token: string
): Promise<string> {
  const form = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: token,
  });
  return (await postForm(`${accountId}/media`, form, 'item container')).id;
}

export async function publishCarousel(post: {
  instagramBusinessAccountId: string;
  slides: { imageUrl: string }[];
  caption?: string;
}): Promise<string> {
  const token = getInstagramAccessToken();
  const children: string[] = [];
  for (const slide of post.slides) {
    children.push(
      await createItemContainer(post.instagramBusinessAccountId, slide.imageUrl, token)
    );
  }
  // The Graph API takes the caption on the carousel container itself, not
  // on individual item containers and not on the media_publish step.
  const carouselForm: Record<string, string> = {
    media_type: 'CAROUSEL',
    children: children.join(','),
    access_token: token,
  };
  if (post.caption) {
    carouselForm.caption = post.caption;
  }
  const carousel = await postForm(
    `${post.instagramBusinessAccountId}/media`,
    new URLSearchParams(carouselForm),
    'carousel container'
  );
  return (
    await postForm(
      `${post.instagramBusinessAccountId}/media_publish`,
      new URLSearchParams({ creation_id: carousel.id, access_token: token }),
      'publication'
    )
  ).id;
}
