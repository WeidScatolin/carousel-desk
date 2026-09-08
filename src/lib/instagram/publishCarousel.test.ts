import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { publishCarousel, PublicationUncertainError, ContainerExpiredError, instagramImageUrl } from './publishCarousel';
const input = { instagramBusinessAccountId: 'ig-test', slides: [{ imageUrl: 'https://cdn.test/1.jpg' }, { imageUrl: 'https://cdn.test/2.jpg' }], caption: 'Legenda' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => vi.stubEnv('INSTAGRAM_ACCESS_TOKEN', 'fake-token'));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
test('waits for FINISHED and persists checkpoints before publishing', async () => {
  const events: string[] = [];
  const mock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ id: 'item1' })).mockResolvedValueOnce(response({ id: 'item2' }))
    .mockResolvedValueOnce(response({ id: 'container' })).mockResolvedValueOnce(response({ status_code: 'FINISHED' }))
    .mockImplementationOnce(async () => { events.push('publish'); return response({ id: 'media' }); });
  vi.stubGlobal('fetch', mock);
  const id = await publishCarousel(input, {
    onContainerCreated: async id => { events.push(id); }, onPublishAttempt: async () => { events.push('checkpoint'); },
  });
  expect(id).toBe('media'); expect(events).toEqual(['container', 'checkpoint', 'publish']);
  expect(mock.mock.calls[2][1]?.body).toEqual(new URLSearchParams({
    media_type: 'CAROUSEL', children: 'item1,item2', access_token: 'fake-token', caption: 'Legenda',
  }));
  expect(mock.mock.calls[3][0]).toContain('fields=status_code');
});
test('resumes a saved container without creating children again', async () => {
  const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ status_code: 'FINISHED' })).mockResolvedValueOnce(response({ id: 'media' }));
  vi.stubGlobal('fetch', mock);
  await publishCarousel(input, { existingContainerId: 'saved', onContainerCreated: vi.fn(), onPublishAttempt: vi.fn() });
  expect(mock).toHaveBeenCalledTimes(2);
  expect(mock.mock.calls[1][0]).toContain('/media_publish');
});
test('does not publish an expired container', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ status_code: 'EXPIRED' })));
  await expect(publishCarousel(input, { existingContainerId: 'saved', onContainerCreated: vi.fn(), onPublishAttempt: vi.fn() })).rejects.toBeInstanceOf(ContainerExpiredError);
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('marks a lost publish response as uncertain', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ status_code: 'FINISHED' })).mockRejectedValueOnce(new Error('timeout')));
  await expect(publishCarousel(input, { existingContainerId: 'saved', onContainerCreated: vi.fn(), onPublishAttempt: vi.fn() })).rejects.toBeInstanceOf(PublicationUncertainError);
});
test('does not treat an HTTP success without a media ID as publication success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ status_code: 'FINISHED' })).mockResolvedValueOnce(response({})));
  await expect(publishCarousel(input, { existingContainerId: 'saved', onContainerCreated: vi.fn(), onPublishAttempt: vi.fn() })).rejects.toBeInstanceOf(PublicationUncertainError);
});
test.each([1, 11])('rejects %i slides without contacting Meta', async n => {
  vi.stubGlobal('fetch', vi.fn());
  await expect(publishCarousel({ ...input, slides: Array.from({ length: n }, () => input.slides[0]) })).rejects.toThrow('2 to 10');
  expect(fetch).not.toHaveBeenCalled();
});

test('requests a JPEG derivative for legacy Cloudinary PNG slides', () => {
  expect(instagramImageUrl('https://res.cloudinary.com/demo/image/upload/v1/slides/slide.png'))
    .toBe('https://res.cloudinary.com/demo/image/upload/v1/slides/slide.jpg');
});
