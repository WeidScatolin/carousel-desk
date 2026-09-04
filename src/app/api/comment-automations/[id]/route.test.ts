import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    commentAutomation: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { PATCH } from './route';

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/comment-automations/a1', { method: 'PATCH', body: JSON.stringify(body) });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/comment-automations/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.commentAutomation.findUnique).mockReset();
    vi.mocked(prisma.commentAutomation.update).mockReset();
  });

  test('returns 400 for an invalid payload', async () => {
    const response = await PATCH(patchRequest({ status: 'NOT_A_STATUS' }), paramsFor('a1'));
    expect(response.status).toBe(400);
    expect(prisma.commentAutomation.update).not.toHaveBeenCalled();
  });

  test('updates keyword and recomputes normalizedKeyword', async () => {
    vi.mocked(prisma.commentAutomation.update).mockResolvedValue({ id: 'a1' } as never);

    const response = await PATCH(patchRequest({ keyword: 'Diagnóstico' }), paramsFor('a1'));

    expect(response.status).toBe(200);
    expect(prisma.commentAutomation.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { keyword: 'Diagnóstico', normalizedKeyword: 'DIAGNOSTICO' },
    });
  });

  test('blocks activation when the underlying post is not published', async () => {
    vi.mocked(prisma.commentAutomation.findUnique).mockResolvedValue({ id: 'a1', post: { status: 'scheduled' } } as never);

    const response = await PATCH(patchRequest({ status: 'ACTIVE' }), paramsFor('a1'));

    expect(response.status).toBe(400);
    expect(prisma.commentAutomation.update).not.toHaveBeenCalled();
  });

  test('allows activation when the post is published', async () => {
    vi.mocked(prisma.commentAutomation.findUnique).mockResolvedValue({ id: 'a1', post: { status: 'published' } } as never);
    vi.mocked(prisma.commentAutomation.update).mockResolvedValue({ id: 'a1', status: 'ACTIVE' } as never);

    const response = await PATCH(patchRequest({ status: 'ACTIVE' }), paramsFor('a1'));

    expect(response.status).toBe(200);
    expect(prisma.commentAutomation.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'ACTIVE' } });
  });

  test('allows pausing without checking the post status', async () => {
    vi.mocked(prisma.commentAutomation.update).mockResolvedValue({ id: 'a1', status: 'PAUSED' } as never);

    const response = await PATCH(patchRequest({ status: 'PAUSED' }), paramsFor('a1'));

    expect(response.status).toBe(200);
    expect(prisma.commentAutomation.findUnique).not.toHaveBeenCalled();
  });
});
