import { z } from 'zod';

export const rejectThemeSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export const rejectPostSchema = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export const approvePostSchema = z.object({
  scheduledAt: z.string().datetime({ message: 'scheduledAt must be an ISO 8601 datetime' }),
});

export const updateSlideSchema = z.object({
  headline: z.string().min(1, 'headline is required'),
  body: z.string().min(1, 'body is required'),
  accentPhrase: z.string().trim().min(1).nullable().optional(),
});

export const updatePostSchema = z
  .object({
    caption: z.string().trim().min(1),
    ctaKeyword: z.string().trim().min(1).transform((value) => value.toUpperCase()).nullable(),
    leadMagnetId: z.string().nullable(),
  })
  .partial();

export type RejectThemeInput = z.infer<typeof rejectThemeSchema>;
export type RejectPostInput = z.infer<typeof rejectPostSchema>;
export type ApprovePostInput = z.infer<typeof approvePostSchema>;
export type UpdateSlideInput = z.infer<typeof updateSlideSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
