import type { JSX } from 'react';
import { isPrivateRepliesEnabled } from '@/lib/instagram/graphApiConfig';
import { prisma } from '@/lib/prisma';
import { AdminNav } from '../AdminNav';
import { AutomationsManager } from './AutomationsManager';

export default async function AutomationsPage(): Promise<JSX.Element> {
  const [automations, publishedPosts] = await Promise.all([
    prisma.commentAutomation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { post: { select: { id: true, instagramPostId: true, caption: true } } },
    }),
    prisma.post.findMany({
      where: { status: 'published' },
      select: { id: true, instagramPostId: true, caption: true },
      orderBy: { publishedAt: 'desc' },
    }),
  ]);

  return (
    <>
      <AdminNav />
      <h1 className="p-4 pb-0 text-lg font-bold">Automações de comentário → DM</h1>
      <AutomationsManager automations={automations} publishedPosts={publishedPosts} repliesEnabled={isPrivateRepliesEnabled()} />
    </>
  );
}
