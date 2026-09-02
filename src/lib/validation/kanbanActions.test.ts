import { describe, test, expect } from 'vitest';
import { rejectThemeSchema, approvePostSchema, updateSlideSchema } from './kanbanActions';

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
});
