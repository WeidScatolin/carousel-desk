'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadMagnet } from '@/generated/prisma/client';

interface LeadMagnetsManagerProps {
  leadMagnets: LeadMagnet[];
}

const EMPTY_FORM = {
  name: '',
  description: '',
  deliveryUrl: '',
  ctaKeyword: '',
  qualificationQuestion: '',
};

export function LeadMagnetsManager({ leadMagnets }: LeadMagnetsManagerProps): JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);

    const response = await fetch('/api/lead-magnets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setCreating(false);
    if (!response.ok) {
      setError('Não foi possível criar. Confira os campos (a URL precisa ser válida).');
      return;
    }
    setForm(EMPTY_FORM);
    router.refresh();
  }

  async function toggleActive(leadMagnet: LeadMagnet): Promise<void> {
    await fetch(`/api/lead-magnets/${leadMagnet.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !leadMagnet.active }),
    });
    router.refresh();
  }

  async function remove(leadMagnet: LeadMagnet): Promise<void> {
    await fetch(`/api/lead-magnets/${leadMagnet.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-5">
      <ul className="flex flex-col gap-2">
        {leadMagnets.map((leadMagnet) => (
          <li key={leadMagnet.id} className="flex items-start justify-between gap-3 rounded-lg border border-carvao/10 bg-white p-3 shadow-sm">
            <div>
              <p className="font-semibold text-carvao">
                {leadMagnet.name} <span className="text-xs font-normal text-carvao/50">({leadMagnet.ctaKeyword})</span>
              </p>
              <p className="text-sm text-carvao/60">{leadMagnet.description}</p>
              <a href={leadMagnet.deliveryUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-carvao/50 underline hover:text-carvao">
                {leadMagnet.deliveryUrl}
              </a>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${leadMagnet.active ? 'bg-green-100 text-green-800' : 'bg-carvao/5 text-carvao/50'}`}>
                {leadMagnet.active ? 'Ativo' : 'Inativo'}
              </span>
              <button type="button" onClick={() => void toggleActive(leadMagnet)} className="text-xs font-medium text-carvao/60 underline hover:text-carvao">
                {leadMagnet.active ? 'Desativar' : 'Ativar'}
              </button>
              <button type="button" onClick={() => void remove(leadMagnet)} className="text-xs font-medium text-laranja underline">
                Excluir
              </button>
            </div>
          </li>
        ))}
        {leadMagnets.length === 0 ? <p className="text-sm text-carvao/50">Nenhum lead magnet cadastrado ainda.</p> : null}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-lg border border-carvao/10 bg-white p-4 shadow-sm">
        <h2 className="font-heading text-sm font-bold uppercase text-carvao">Novo lead magnet</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Nome</span>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
            className="rounded border border-carvao/15 p-2 text-carvao focus:border-laranja focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Descrição</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            required
            rows={2}
            className="rounded border border-carvao/15 p-2 text-carvao focus:border-laranja focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">URL de entrega</span>
          <input
            value={form.deliveryUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, deliveryUrl: event.target.value }))}
            required
            type="url"
            className="rounded border border-carvao/15 p-2 text-carvao focus:border-laranja focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Palavra-chave</span>
          <input
            value={form.ctaKeyword}
            onChange={(event) => setForm((prev) => ({ ...prev, ctaKeyword: event.target.value }))}
            required
            className="rounded border border-carvao/15 p-2 text-carvao focus:border-laranja focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Pergunta de qualificação</span>
          <input
            value={form.qualificationQuestion}
            onChange={(event) => setForm((prev) => ({ ...prev, qualificationQuestion: event.target.value }))}
            required
            className="rounded border border-carvao/15 p-2 text-carvao focus:border-laranja focus:outline-none"
          />
        </label>
        {error ? <p className="text-sm font-medium text-laranja">{error}</p> : null}
        <button
          type="submit"
          disabled={creating}
          className="w-fit rounded bg-carvao px-4 py-2 text-sm font-semibold uppercase tracking-wide text-creme transition hover:bg-laranja disabled:opacity-40"
        >
          {creating ? 'Criando…' : 'Criar'}
        </button>
      </form>
    </div>
  );
}
