import { z } from 'zod';

export const createCommentAutomationSchema = z.object({
  postId: z.string().trim().min(1, 'postId is required'),
  keyword: z.string().trim().min(1, 'keyword is required'),
  matchMode: z.enum(['EXACT', 'CONTAINS_WORD']).default('CONTAINS_WORD'),
  replyMessage: z.string().trim().min(1, 'replyMessage is required'),
  assetUrl: z.string().trim().url('assetUrl must be a valid URL').optional(),
});

export type CreateCommentAutomationInput = z.infer<typeof createCommentAutomationSchema>;

export const updateCommentAutomationSchema = z
  .object({
    keyword: z.string().trim().min(1),
    matchMode: z.enum(['EXACT', 'CONTAINS_WORD']),
    replyMessage: z.string().trim().min(1),
    assetUrl: z.string().trim().url().nullable(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'FINISHED']),
  })
  .partial();

export type UpdateCommentAutomationInput = z.infer<typeof updateCommentAutomationSchema>;
