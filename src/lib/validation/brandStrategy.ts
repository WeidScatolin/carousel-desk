import { z } from 'zod';

export const brandStrategySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  positioning: z.string().trim().min(1, 'positioning is required'),
  targetAudience: z.string().trim().min(1, 'targetAudience is required'),
  coreProblem: z.string().trim().min(1, 'coreProblem is required'),
  promise: z.string().trim().min(1, 'promise is required'),
  offerDescription: z.string().trim().min(1, 'offerDescription is required'),
  tone: z.string().trim().min(1, 'tone is required'),
  defaultCtaKeyword: z.string().trim().min(1, 'defaultCtaKeyword is required'),
  instagramHandle: z.string().trim().min(1, 'instagramHandle is required'),
});

export type BrandStrategyInput = z.infer<typeof brandStrategySchema>;

export const leadMagnetSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  description: z.string().trim().min(1, 'description is required'),
  deliveryUrl: z.string().trim().url('deliveryUrl must be a valid URL'),
  ctaKeyword: z
    .string()
    .trim()
    .min(1, 'ctaKeyword is required')
    .transform((value) => value.toUpperCase()),
  qualificationQuestion: z.string().trim().min(1, 'qualificationQuestion is required'),
  active: z.boolean().optional(),
});

export type LeadMagnetInput = z.infer<typeof leadMagnetSchema>;
