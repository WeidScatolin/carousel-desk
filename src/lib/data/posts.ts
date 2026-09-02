import { prisma } from '@/lib/prisma';
import type { Post, PostStatus, Slide } from '@/generated/prisma/client';

export interface PostWithSlides extends Post {
  slides: Slide[];
}

export async function listPostsByStatus(status: PostStatus): Promise<PostWithSlides[]> {
  return prisma.post.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: { slides: { orderBy: { order: 'asc' } } },
  });
}
