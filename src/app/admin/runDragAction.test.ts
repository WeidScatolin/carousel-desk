// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runDragAction } from './runDragAction';

describe('runDragAction', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('prompt', vi.fn());
  });

  test('approve_theme calls the approve route with no body', async () => {
    await runDragAction({ type: 'approve_theme', themeId: 'theme-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/themes/theme-1/approve', { method: 'POST' });
  });

  test('reject_theme skips the request when the prompt is cancelled', async () => {
    vi.mocked(window.prompt).mockReturnValue(null);

    await runDragAction({ type: 'reject_theme', themeId: 'theme-1' });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('reject_theme sends the reason from the prompt', async () => {
    vi.mocked(window.prompt).mockReturnValue('fora do nicho');

    await runDragAction({ type: 'reject_theme', themeId: 'theme-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/themes/theme-1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'fora do nicho' }),
    });
  });

  test('approve_post sends the scheduledAt from the prompt', async () => {
    vi.mocked(window.prompt).mockReturnValue('2026-09-05T12:00:00.000Z');

    await runDragAction({ type: 'approve_post', postId: 'post-1' });

    expect(global.fetch).toHaveBeenCalledWith('/api/posts/post-1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: '2026-09-05T12:00:00.000Z' }),
    });
  });
});
