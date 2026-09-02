import type { Theme } from '@/generated/prisma/client';
import { listThemesByStatus } from './themes';
import { listPostsByStatus, type PostWithSlides } from './posts';

export interface KanbanBoard {
  suggested: Theme[];
  generating: PostWithSlides[];
  pendingApproval: PostWithSlides[];
  scheduled: PostWithSlides[];
  published: PostWithSlides[];
  rejectedThemes: Theme[];
  rejectedPosts: PostWithSlides[];
}

export async function getKanbanBoard(): Promise<KanbanBoard> {
  const [suggested, generating, pendingApproval, scheduled, published, rejectedThemes, rejectedPosts] =
    await Promise.all([
      listThemesByStatus('pending'),
      listPostsByStatus('generating'),
      listPostsByStatus('pending_approval'),
      listPostsByStatus('scheduled'),
      listPostsByStatus('published'),
      listThemesByStatus('rejected'),
      listPostsByStatus('rejected'),
    ]);

  return { suggested, generating, pendingApproval, scheduled, published, rejectedThemes, rejectedPosts };
}
