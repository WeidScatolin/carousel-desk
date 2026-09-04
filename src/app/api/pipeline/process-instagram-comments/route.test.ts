import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    commentAutomation: { findMany: vi.fn() },
    commentDelivery: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/instagram/fetchComments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/instagram/fetchComments')>('@/lib/instagram/fetchComments');
  return { ...actual, fetchAllComments: vi.fn() };
});
vi.mock('@/lib/leads/deliverCommentReply', () => ({
  composeReplyMessage: vi.fn((automation: { replyMessage: string }) => automation.replyMessage),
  deliverCommentReply: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { fetchAllComments } from '@/lib/instagram/fetchComments';
import { deliverCommentReply } from '@/lib/leads/deliverCommentReply';
import { isUniqueConstraintViolation } from '@/lib/prismaErrors';
import { POST } from './route';

function authorizedRequest(): Request {
  return new Request('http://localhost/api/pipeline/process-instagram-comments', {
    method: 'POST',
    headers: { Authorization: 'Bearer publish-secret' },
  });
}

function automation(overrides: Partial<{ id: string; instagramMediaId: string; keyword: string; matchMode: string; createdAt: Date }> = {}) {
  return {
    id: 'automation-1',
    postId: 'post-1',
    instagramMediaId: 'media-1',
    keyword: 'MAPA',
    normalizedKeyword: 'MAPA',
    matchMode: 'CONTAINS_WORD',
    replyMessage: 'Aqui está o mapa!',
    assetUrl: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function comment(overrides: Partial<{ id: string; text: string; username: string | null; timestamp: string }> = {}) {
  return { id: 'comment-1', text: 'Quero o MAPA', username: 'joao', timestamp: '2026-01-01T00:00:00Z', ...overrides };
}

describe('POST /api/pipeline/process-instagram-comments', () => {
  beforeEach(() => {
    process.env.PUBLISH_API_TOKEN = 'publish-secret';
    vi.mocked(prisma.commentAutomation.findMany).mockReset();
    vi.mocked(prisma.commentDelivery.findUnique).mockReset();
    vi.mocked(prisma.commentDelivery.create).mockReset();
    vi.mocked(prisma.commentDelivery.update).mockReset();
    vi.mocked(fetchAllComments).mockReset();
    vi.mocked(deliverCommentReply).mockReset();
  });

  afterEach(() => {
    delete process.env.PUBLISH_API_TOKEN;
  });

  test('returns 401 when the bearer token does not match, without calling Meta', async () => {
    const response = await POST(new Request('http://localhost/x', { method: 'POST', headers: { Authorization: 'Bearer wrong' } }));

    expect(response.status).toBe(401);
    expect(fetchAllComments).not.toHaveBeenCalled();
  });

  test('reports zero counts when there are no active automations, without calling Meta', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([]);

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toEqual({
      postsChecked: 0,
      commentsFound: 0,
      newComments: 0,
      matched: 0,
      simulated: 0,
      sent: 0,
      ignored: 0,
      failed: 0,
    });
    expect(fetchAllComments).not.toHaveBeenCalled();
  });

  test('skips comments already registered (dedup) and does not attempt delivery again', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment()]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue({ id: 'existing' } as never);

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toMatchObject({ commentsFound: 1, newComments: 0 });
    expect(prisma.commentDelivery.create).not.toHaveBeenCalled();
    expect(deliverCommentReply).not.toHaveBeenCalled();
  });

  test('counts a non-matching new comment as ignored and creates no delivery', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment({ text: 'oi, adorei o post!' })]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue(null);

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toMatchObject({ newComments: 1, matched: 0, ignored: 1 });
    expect(prisma.commentDelivery.create).not.toHaveBeenCalled();
  });

  test('matches, claims, delivers via SIMULATED provider and records SIMULATED', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment()]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.commentDelivery.create).mockResolvedValue({ id: 'delivery-1' } as never);
    vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'SIMULATED', externalMessageId: 'simulated-comment-1', lastError: null });

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toMatchObject({ matched: 1, simulated: 1, sent: 0, failed: 0 });
    expect(prisma.commentDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ automationId: 'automation-1', instagramCommentId: 'comment-1', status: 'PROCESSING', lastError: null }),
    });
  });

  test('records FAILED and does not mark deliveredAt when the provider fails', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment()]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.commentDelivery.create).mockResolvedValue({ id: 'delivery-1' } as never);
    vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'FAILED', externalMessageId: null, lastError: 'boom' });

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toMatchObject({ matched: 1, failed: 1 });
    expect(prisma.commentDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'FAILED', externalMessageId: null, lastError: 'boom', deliveredAt: null },
    });
  });

  test('picks the deterministic first automation and records the conflict when several match', async () => {
    const first = automation({ id: 'automation-1', createdAt: new Date('2026-01-01') });
    const second = automation({ id: 'automation-2', createdAt: new Date('2026-01-02') });
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([first, second] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment()]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.commentDelivery.create).mockResolvedValue({ id: 'delivery-1' } as never);
    vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'SIMULATED', externalMessageId: 'x', lastError: null });

    await POST(authorizedRequest());

    expect(prisma.commentDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ automationId: 'automation-1', lastError: expect.stringContaining('automation-2') }),
    });
  });

  test('treats a unique constraint violation on create as a lost race, not a failure', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment()]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue(null);
    const { Prisma } = await import('@/generated/prisma/client');
    vi.mocked(prisma.commentDelivery.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }),
    );

    const response = await POST(authorizedRequest());

    expect(isUniqueConstraintViolation(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 'test' }))).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ matched: 1, simulated: 0, sent: 0, failed: 0 });
    expect(deliverCommentReply).not.toHaveBeenCalled();
  });

  test('skips a media whose comment fetch fails, without failing the whole run', async () => {
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockRejectedValue(new Error('rate limited'));

    const response = await POST(authorizedRequest());

    await expect(response.json()).resolves.toMatchObject({ postsChecked: 1, commentsFound: 0 });
  });

  test('never leaks comment text, username or the access token in the response', async () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'super-secret-token';
    vi.mocked(prisma.commentAutomation.findMany).mockResolvedValue([automation()] as never);
    vi.mocked(fetchAllComments).mockResolvedValue([comment({ text: 'segredo pessoal MAPA', username: 'sensitive_user' })]);
    vi.mocked(prisma.commentDelivery.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.commentDelivery.create).mockResolvedValue({ id: 'delivery-1' } as never);
    vi.mocked(deliverCommentReply).mockResolvedValue({ status: 'SIMULATED', externalMessageId: 'x', lastError: null });

    const response = await POST(authorizedRequest());
    const text = JSON.stringify(await response.json());

    expect(text).not.toContain('segredo pessoal');
    expect(text).not.toContain('sensitive_user');
    expect(text).not.toContain('super-secret-token');
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });
});
