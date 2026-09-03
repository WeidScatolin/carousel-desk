import { z } from 'zod';

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1),
    keyword: z.string().trim().min(1).transform((value) => value.toUpperCase()),
    matchMode: z.enum(['EXACT', 'CONTAINS_WORD']),
    assetName: z.string().trim().min(1),
    assetUrl: z.string().trim().url(),
    deliveryMessage: z.string().trim().min(1),
    qualificationQuestion: z.string().trim().min(1).nullable(),
    publicReplyTemplate: z.string().trim().min(1).nullable(),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'FINISHED']),
  })
  .partial();

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
