import { getGraphApiBaseUrl, getInstagramAccessToken } from './graphApiConfig';

export class PublicationUncertainError extends Error {}
export class ContainerExpiredError extends Error {}
export class MetaRejectedError extends Error {
  constructor(public status: number, public code?: number) {
    super('Instagram rejected the request (HTTP ' + status + (code ? ', code ' + code : '') + ')');
  }
}

async function postForm(path: string, form: URLSearchParams, publication = false): Promise<string> {
  let response: Response;
  let payload: { id?: unknown; error?: { code?: number } };
  try {
    response = await fetch(getGraphApiBaseUrl() + '/' + path, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    });
    payload = await response.json();
  } catch {
    if (publication) throw new PublicationUncertainError('Publication response unavailable; verify Instagram before retrying');
    throw new Error('Instagram container request failed or timed out');
  }
  if (!response.ok) {
    if (publication && response.status >= 500) throw new PublicationUncertainError('Instagram publication returned a server error; verify before retrying');
    throw new MetaRejectedError(response.status, payload.error?.code);
  }
  if (typeof payload.id !== 'string' || !payload.id) {
    if (publication) throw new PublicationUncertainError('Publication returned no media ID; verify before retrying');
    throw new Error('Instagram container returned no id');
  }
  return payload.id;
}

// Meta documents FINISHED as the state ready for publication. A bounded wait
// keeps a serverless invocation below its deadline; the next run can resume
// the saved container if Meta still needs time to process it.
async function waitForContainer(containerId: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(getGraphApiBaseUrl() + '/' + containerId + '?fields=status_code', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new MetaRejectedError(response.status);
    const payload = await response.json() as { status_code?: string };
    if (payload.status_code === 'FINISHED') return;
    if (payload.status_code === 'PUBLISHED') throw new PublicationUncertainError('Container already published; reconcile the existing media ID');
    if (payload.status_code === 'EXPIRED' || payload.status_code === 'ERROR') throw new ContainerExpiredError('Instagram container is expired or invalid');
    if (payload.status_code !== 'IN_PROGRESS') throw new Error('Unknown Instagram container state');
    if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Instagram container is still processing; resume it on the next attempt');
}

export interface PublishCheckpoint {
  existingContainerId?: string | null;
  onContainerCreated: (id: string) => Promise<void>;
  onPublishAttempt: () => Promise<void>;
}

export async function publishCarousel(post: {
  instagramBusinessAccountId: string;
  slides: { imageUrl: string }[];
  caption?: string;
}, checkpoint?: PublishCheckpoint): Promise<string> {
  if (post.slides.length < 2 || post.slides.length > 10) throw new Error('Instagram carousels require 2 to 10 slides');
  const token = getInstagramAccessToken();
  let containerId = checkpoint?.existingContainerId;
  if (!containerId) {
    const children: string[] = [];
    for (const slide of post.slides) {
      children.push(await postForm(post.instagramBusinessAccountId + '/media', new URLSearchParams({
        image_url: slide.imageUrl, is_carousel_item: 'true', access_token: token,
      })));
    }
    const form = new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), access_token: token });
    if (post.caption) form.set('caption', post.caption);
    containerId = await postForm(post.instagramBusinessAccountId + '/media', form);
    await checkpoint?.onContainerCreated(containerId);
  }
  await waitForContainer(containerId, token);
  await checkpoint?.onPublishAttempt();
  return postForm(post.instagramBusinessAccountId + '/media_publish',
    new URLSearchParams({ creation_id: containerId, access_token: token }), true);
}
