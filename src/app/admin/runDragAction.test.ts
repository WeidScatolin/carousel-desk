// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runDragAction } from './runDragAction';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 422): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('runDragAction', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('approve_theme calls the approve route with no body', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}));

    const result = await runDragAction({ type: 'approve_theme', themeId: 'theme-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/themes/theme-1/approve', { method: 'POST' });
    expect(result.ok).toBe(true);
  });

  test('reject_theme skips the request when no reason is given', async () => {
    const result = await runDragAction({ type: 'reject_theme', themeId: 'theme-1' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  test('reject_theme sends the given reason', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}));

    await runDragAction({ type: 'reject_theme', themeId: 'theme-1' }, { reason: 'fora do nicho' });

    expect(global.fetch).toHaveBeenCalledWith('/api/themes/theme-1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'fora do nicho' }),
    });
  });

  test('approve_post sends the given scheduledAt', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}));

    const result = await runDragAction({ type: 'approve_post', postId: 'post-1' }, { scheduledAt: '2026-09-05T12:00:00.000Z' });

    expect(global.fetch).toHaveBeenCalledWith('/api/posts/post-1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: '2026-09-05T12:00:00.000Z' }),
    });
    expect(result.ok).toBe(true);
  });

  test('approve_post surfaces approval blockers from a 422 response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ error: 'Post is not ready for approval', blockers: ['O post não tem legenda.'] }, false),
    );

    const result = await runDragAction({ type: 'approve_post', postId: 'post-1' }, { scheduledAt: '2026-09-05T12:00:00.000Z' });

    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(['O post não tem legenda.']);
  });

  test('reject_post sends the given reason', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}));

    await runDragAction({ type: 'reject_post', postId: 'post-1' }, { reason: 'baixa qualidade' });

    expect(global.fetch).toHaveBeenCalledWith('/api/posts/post-1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'baixa qualidade' }),
    });
  });
});
