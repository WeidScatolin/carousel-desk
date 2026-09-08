import { prisma } from '@/lib/prisma';

export async function readinessIssues(replies = false): Promise<string[]> {
  const issues: string[] = [];
  if (!await prisma.brandStrategy.findFirst({ where: { active: true } })) issues.push('Cadastre uma estratégia de marca ativa.');
  for (const name of ['PUBLISH_API_TOKEN', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID']) {
    if (!process.env[name]) issues.push('Configure ' + name + ' no ambiente da aplicação.');
  }
  for (const task of ['THEME_SUGGESTION', 'COPYWRITING']) {
    const provider = process.env['PROVIDER_' + task];
    if (!['nvidia', 'claude'].includes(provider ?? '')) issues.push('Escolha o provedor de IA em PROVIDER_' + task + '.');
    else if (!process.env[provider === 'nvidia' ? 'NVIDIA_API_KEY' : 'ANTHROPIC_API_KEY']) issues.push('Configure a chave de IA para ' + task + '.');
  }
  if (replies && process.env.INSTAGRAM_PRIVATE_REPLIES_ENABLED !== 'true') {
    issues.push('Habilite INSTAGRAM_PRIVATE_REPLIES_ENABLED após validar a integração de mensagens com a Meta.');
  }
  return issues;
}
