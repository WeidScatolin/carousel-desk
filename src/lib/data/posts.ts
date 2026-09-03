import { prisma } from '@/lib/prisma';
import type { LeadMagnet, Post, PostStatus, Slide, Theme } from '@/generated/prisma/client';

export interface PostWithSlides extends Post {
  slides: Slide[];
  theme: Theme;
  leadMagnet: LeadMagnet | null;
}

export async function listPostsByStatus(status: PostStatus): Promise<PostWithSlides[]> {
  return prisma.post.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: { slides: { orderBy: { order: 'asc' } }, theme: true, leadMagnet: true },
  });
}
