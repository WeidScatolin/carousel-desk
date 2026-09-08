import { prisma } from '@/lib/prisma';
import { normalizeKeyword } from '@/lib/leads/normalizeKeyword';

export async function linkCommentAutomation(postId: string): Promise<void> {
  const settings = await prisma.automationSettings.findUnique({ where: { id: 'default' } });
  if (!settings?.autoCommentReplies) return;
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { leadMagnet: true } });
  if (post.status !== 'published' || !post.instagramPostId || post.postGoal !== 'comment_dm'
      || !post.ctaKeyword || !post.leadMagnet?.active) return;
  const magnet = post.leadMagnet;
  if (!/^https:\/\//.test(magnet.deliveryUrl)) throw new Error('Lead magnet requires an HTTPS delivery URL');
  const normalizedKeyword = normalizeKeyword(post.ctaKeyword);
  await prisma.commentAutomation.upsert({
    where: { instagramMediaId_normalizedKeyword: { instagramMediaId: post.instagramPostId, normalizedKeyword } },
    create: { postId, instagramMediaId: post.instagramPostId, keyword: post.ctaKeyword, normalizedKeyword,
      replyMessage: 'Aqui está o material que você pediu: ' + magnet.name + '.',
      assetUrl: magnet.deliveryUrl, status: 'ACTIVE' },
    update: {},
  });
}
