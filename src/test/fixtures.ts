import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';

export async function fixturePost(data: Partial<Prisma.PostUncheckedCreateInput> = {}) {
  const theme = await prisma.theme.create({ data: { id: 'fixture-' + crypto.randomUUID(),
    sourceUrl: 'https://example.test/' + crypto.randomUUID(), headlineSuggestion: 'Tema de teste', summary: 'Resumo',
    hasSufficientEvidence: true, articlePublishedAt: new Date() } });
  return prisma.post.create({ data: {
    themeId: theme.id, status: 'pending_approval', generationComplete: true, expectedSlideCount: 2, caption: 'Legenda de teste',
    ...data,
    slides: { create: [0, 1].map(order => ({ order, template: order ? 'evidence' : 'cover',
      htmlContent: '<html>Teste</html>', imageUrl: 'https://cdn.test/' + order + '.jpg', cloudinaryPublicId: 'slide-' + order,
      role: order ? 'evidence' : 'cover', sourceLabel: order ? 'Fonte, 2026' : null })) },
  }, include: { slides: { orderBy: { order: 'asc' } }, theme: true } });
}
export async function clearFixtures() {
  const postWhere = { theme: { id: { startsWith: 'fixture-' } } };
  await prisma.commentDelivery.deleteMany({ where: { automation: { post: postWhere } } });
  await prisma.commentAutomation.deleteMany({ where: { post: postWhere } });
  await prisma.contentBrief.deleteMany({ where: { theme: { id: { startsWith: 'fixture-' } } } });
  await prisma.slide.deleteMany({ where: { post: postWhere } });
  await prisma.post.deleteMany({ where: postWhere });
  await prisma.theme.deleteMany({ where: { id: { startsWith: 'fixture-' } } });
  await prisma.brandStrategy.deleteMany({ where: { id: { startsWith: 'fixture-' } } });
  await prisma.pipelineState.deleteMany({});
  await prisma.automationSettings.upsert({ where: { id: 'default' },
    create: { id: 'default' }, update: { enabled: false, autoCommentReplies: false, dailyPostLimit: 1, minThemeScore: 70, publishHourUtc: 12 } });
}
export async function fixtureBrand() {
  return prisma.brandStrategy.create({ data: { id: 'fixture-' + crypto.randomUUID(), name: 'Teste', positioning: 'Tecnologia aplicada',
    targetAudience: 'Empreendedores', coreProblem: 'Tempo', promise: 'Clareza', offerDescription: 'Guia',
    tone: 'Direto', defaultCtaKeyword: 'GUIA', instagramHandle: '@teste' } });
}
