require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../src/generated/prisma/client');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BRAND_STRATEGY = {
  name: 'Carousel Desk — posicionamento padrão',
  positioning:
    'Traduzir mudanças da IA em automações e agentes que reduzem trabalho manual, melhoram atendimento e criam oportunidades de receita para pequenos e médios negócios.',
  targetAudience:
    'Donos de pequenos e médios negócios, líderes de vendas, marketing e operações que conhecem IA, mas não sabem o que implementar.',
  coreProblem:
    'Excesso de processos manuais, atendimento lento, follow-up inconsistente e dificuldade de transformar IA em resultado.',
  promise:
    'Traduzir mudanças da IA em automações e agentes que reduzem trabalho, melhoram atendimento e criam oportunidades de receita.',
  offerDescription: 'Diagnóstico, desenvolvimento e implementação de automações e agentes de IA.',
  tone: 'Confiante, levemente provocador, analítico — explica o mecanismo em vez de listar dicas genéricas.',
  defaultCtaKeyword: 'MAPA',
  instagramHandle: '@carousel-desk',
  active: true,
};

const LEAD_MAGNET = {
  name: 'Mapa de Oportunidades de Automação com IA',
  description:
    'Material gratuito que ajuda o leitor a identificar onde a IA pode reduzir trabalho manual e criar oportunidades de receita no próprio negócio.',
  deliveryUrl: 'https://carousel-desk.vercel.app/materiais/mapa-de-oportunidades-de-automacao-com-ia',
  ctaKeyword: 'MAPA',
  qualificationQuestion: 'Qual área mais consome tempo hoje: atendimento, vendas ou operação?',
  active: true,
};

async function main() {
  const existingStrategy = await prisma.brandStrategy.findFirst({ where: { active: true } });
  if (existingStrategy) {
    console.log(`BrandStrategy ativa já existe (${existingStrategy.id}) — nada a fazer.`);
  } else {
    const created = await prisma.brandStrategy.create({ data: BRAND_STRATEGY });
    console.log(`BrandStrategy criada: ${created.id}`);
  }

  const existingMagnet = await prisma.leadMagnet.findFirst({ where: { ctaKeyword: LEAD_MAGNET.ctaKeyword } });
  if (existingMagnet) {
    console.log(`LeadMagnet com keyword "${LEAD_MAGNET.ctaKeyword}" já existe (${existingMagnet.id}) — nada a fazer.`);
  } else {
    const created = await prisma.leadMagnet.create({ data: LEAD_MAGNET });
    console.log(`LeadMagnet criado: ${created.id}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
