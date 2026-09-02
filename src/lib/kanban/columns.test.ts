import { describe, test, expect } from 'vitest';
import { resolveDragAction } from './columns';

describe('resolveDragAction', () => {
  test('dragging a theme from suggested to generating resolves to approve_theme', () => {
    const action = resolveDragAction('suggested', 'generating', { cardType: 'theme', id: 'theme-1' });

    expect(action).toEqual({ type: 'approve_theme', themeId: 'theme-1' });
  });

  test('dragging a theme from suggested to rejected resolves to reject_theme', () => {
    const action = resolveDragAction('suggested', 'rejected', { cardType: 'theme', id: 'theme-1' });

    expect(action).toEqual({ type: 'reject_theme', themeId: 'theme-1' });
  });

  test('dragging a post from pending_approval to scheduled resolves to approve_post', () => {
    const action = resolveDragAction('pending_approval', 'scheduled', { cardType: 'post', id: 'post-1' });

    expect(action).toEqual({ type: 'approve_post', postId: 'post-1' });
  });

  test('dragging a post from pending_approval to rejected resolves to reject_post', () => {
    const action = resolveDragAction('pending_approval', 'rejected', { cardType: 'post', id: 'post-1' });

    expect(action).toEqual({ type: 'reject_post', postId: 'post-1' });
  });

  test('returns null for a no-op drag within the same column', () => {
    expect(resolveDragAction('suggested', 'suggested', { cardType: 'theme', id: 'theme-1' })).toBeNull();
  });

  test('returns null for an unsupported transition', () => {
    expect(resolveDragAction('generating', 'published', { cardType: 'post', id: 'post-1' })).toBeNull();
  });

  test('returns null when the card type does not match the origin column', () => {
    expect(
      resolveDragAction('suggested', 'generating', { cardType: 'post', id: 'post-1' })
    ).toBeNull();
  });
});
