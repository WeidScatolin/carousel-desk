import { prisma } from '@/lib/prisma';
import { readinessIssues } from '@/lib/pipeline/readiness';
import { safeError } from '@/lib/pipeline/state';
import { AdminNav } from '../AdminNav';
import { OperationForm } from './OperationForm';

export const dynamic = 'force-dynamic';
const LABELS: Record<string, string> = { discover: 'Descoberta', autopilot: 'Seleção e agendamento', publish: 'Publicação', comments: 'Comentários' };

export default async function OperationPage() {
  const [settings, stages, errors, issues] = await Promise.all([
    prisma.automationSettings.findUnique({ where: { id: 'default' } }),
    prisma.pipelineState.findMany({ orderBy: { stage: 'asc' } }),
    prisma.post.findMany({ where: { OR: [{ status: 'error' }, { errorStage: { not: null } }] }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    readinessIssues(),
  ]);
  return <>
    <AdminNav />
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-5">
      <h1 className="font-heading text-2xl font-bold">Operação automática</h1>
      <p>Comece com um post por dia. A seleção por IA e as validações técnicas não garantem a exatidão do conteúdo; acompanhe o Quadro e ajuste a estratégia.</p>
      {issues.length > 0 && <div className="rounded border border-laranja/40 p-4"><h2 className="font-semibold">Configuração pendente</h2><ul className="list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      <OperationForm initial={settings ?? { enabled: false, dailyPostLimit: 1, publishHourUtc: 12, minThemeScore: 70, autoCommentReplies: false }} />
      <section className="overflow-x-auto"><h2 className="mb-3 font-heading text-xl font-bold">Últimas execuções</h2>
        <table className="w-full text-left text-sm"><thead><tr><th>Etapa</th><th>Último sucesso UTC</th><th>Situação</th></tr></thead>
          <tbody>{stages.map(stage => <tr key={stage.stage} className="border-t border-carvao/10">
            <td className="py-3">{LABELS[stage.stage] ?? stage.stage}</td><td>{stage.lastSuccessAt?.toISOString() ?? 'Ainda não executada'}</td>
            <td>{stage.lastError ? safeError(stage.lastError) : stage.leaseUntil && stage.leaseUntil > new Date() ? 'Em execução' : 'Concluída'}</td>
          </tr>)}</tbody></table>
        {!stages.length && <p className="py-3 text-sm">As execuções aparecerão após a aplicação da atualização e a primeira chamada dos fluxos.</p>}
      </section>
      <section><h2 className="mb-3 font-heading text-xl font-bold">Posts que precisam de atenção</h2>
        {!errors.length ? <p>Nenhum erro registrado.</p> : <ul className="space-y-3">{errors.map(post => <li key={post.id} className="rounded border p-3 text-sm">
          <strong>{post.id}</strong><p>{post.errorMessage ? safeError(post.errorMessage) : post.errorStage}</p>
          {post.errorStage === 'publish_uncertain' && <p>Confira o Instagram antes de qualquer nova tentativa. O sistema não republicará este post automaticamente.</p>}
        </li>)}</ul>}
      </section>
    </main>
  </>;
}
