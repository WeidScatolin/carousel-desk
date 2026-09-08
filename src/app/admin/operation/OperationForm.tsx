'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
interface Values { enabled: boolean; dailyPostLimit: number; publishHourUtc: number; minThemeScore: number; autoCommentReplies: boolean }

export function OperationForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/operation', { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      setMessage(response.ok ? 'Configuração salva.' : data.error ?? 'Não foi possível salvar.');
      if (response.ok) router.refresh();
    } catch { setMessage('Falha de conexão. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="flex max-w-xl flex-col gap-5 rounded border border-carvao/15 bg-white p-5">
    <label className="flex gap-3 font-semibold"><input type="checkbox" checked={values.enabled}
      onChange={e => setValues({ ...values, enabled: e.target.checked })} />Operação automática ativa</label>
    <p className="text-sm text-carvao/70">Seleciona temas recentes, gera carrosséis e agenda os que passam pelas validações. Pausar interrompe novos agendamentos e a publicação automática pendente. Um envio já iniciado pode terminar.</p>
    <label className="flex flex-col gap-1">Limite de posts por dia
      <input type="number" min={1} max={3} required value={values.dailyPostLimit} className="rounded border p-2"
        onChange={e => setValues({ ...values, dailyPostLimit: Number(e.target.value) })} /></label>
    <label className="flex flex-col gap-1">Primeiro horário do dia, em UTC (0–23)
      <input type="number" min={0} max={23} required value={values.publishHourUtc} className="rounded border p-2"
        onChange={e => setValues({ ...values, publishHourUtc: Number(e.target.value) })} /></label>
    <p className="text-sm text-carvao/70">Posts adicionais são distribuídos até o fim do dia UTC. Execuções agendadas podem sofrer atrasos; o horário não é uma garantia de publicação.</p>
    <label className="flex flex-col gap-1">Nota mínima para selecionar um tema (0–100)
      <input type="number" min={0} max={100} required value={values.minThemeScore} className="rounded border p-2"
        onChange={e => setValues({ ...values, minThemeScore: Number(e.target.value) })} /></label>
    <label className="flex gap-3"><input type="checkbox" checked={values.autoCommentReplies}
      onChange={e => setValues({ ...values, autoCommentReplies: e.target.checked })} />Vincular entrega de material aos posts com palavra-chave</label>
    <p className="text-sm text-carvao/70">Exige material ativo com link HTTPS, integração da Meta validada e processamento de comentários habilitado no GitHub. As automações já criadas são pausadas na tela Automações.</p>
    <button disabled={busy} className="w-fit rounded bg-carvao px-4 py-2 font-semibold text-creme disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar configuração'}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
