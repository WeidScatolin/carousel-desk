import { describe, test, expect } from 'vitest';
import { rejectThemeSchema, approvePostSchema, updateSlideSchema, updatePostSchema } from './kanbanActions';

describe('kanban action schemas', () => {
  test('rejectThemeSchema accepts a non-empty reason', () => {
    expect(rejectThemeSchema.safeParse({ reason: 'fora do nicho' }).success).toBe(true);
  });

  test('rejectThemeSchema rejects an empty reason', () => {
    expect(rejectThemeSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  test('approvePostSchema accepts a valid ISO datetime', () => {
    expect(approvePostSchema.safeParse({ scheduledAt: '2026-09-05T12:00:00.000Z' }).success).toBe(true);
  });

  test('approvePostSchema rejects a non-ISO string', () => {
    expect(approvePostSchema.safeParse({ scheduledAt: 'amanhã' }).success).toBe(false);
  });

  test('updateSlideSchema requires both headline and body', () => {
    expect(updateSlideSchema.safeParse({ headline: 'Título' }).success).toBe(false);
    expect(updateSlideSchema.safeParse({ headline: 'Título', body: 'Corpo' }).success).toBe(true);
  });

  test('updateSlideSchema accepts an optional accentPhrase, including null', () => {
    expect(updateSlideSchema.safeParse({ headline: 'Título', body: 'Corpo', accentPhrase: 'Título' }).success).toBe(true);
    expect(updateSlideSchema.safeParse({ headline: 'Título', body: 'Corpo', accentPhrase: null }).success).toBe(true);
  });

  test('updatePostSchema accepts a partial payload and uppercases ctaKeyword', () => {
    const result = updatePostSchema.safeParse({ ctaKeyword: 'mapa' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ctaKeyword).toBe('MAPA');
    }
  });

  test('updatePostSchema accepts an empty object (no changes)', () => {
    expect(updatePostSchema.safeParse({}).success).toBe(true);
  });

  test('updatePostSchema rejects an empty caption', () => {
    expect(updatePostSchema.safeParse({ caption: '' }).success).toBe(false);
  });
});
