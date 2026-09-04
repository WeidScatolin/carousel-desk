'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import type { CommentAutomation, CommentDelivery, KeywordMatchMode } from '@/generated/prisma/client';

interface PublishedPost {
  id: string;
  instagramPostId: string | null;
  caption: string | null;
}

type AutomationWithPost = CommentAutomation & { post: PublishedPost };

interface AutomationsManagerProps {
  automations: AutomationWithPost[];
  publishedPosts: PublishedPost[];
  repliesEnabled: boolean;
}

const EMPTY_FORM = {
  postId: '',
  keyword: '',
  matchMode: 'CONTAINS_WORD' as KeywordMatchMode,
  replyMessage: '',
  assetUrl: '',
};

const FIELD_CLASSES = 'rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none';

function postLabel(post: PublishedPost): string {
  const caption = post.caption?.slice(0, 60) ?? '(sem legenda)';
  return `${caption} — ${post.instagramPostId ?? 'sem ID'}`;
}

async function patchAutomation(id: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`/api/comment-automations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function DeliveryRow({ delivery, onReprocess }: { delivery: CommentDelivery; onReprocess: (id: string) => void }): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-carvao/10 py-1.5 text-xs">
      <span className="text-carvao/70">
        {delivery.instagramUsername ?? 'anônimo'} — <span className="font-mono font-semibold text-carvao">{delivery.status}</span>
        {delivery.lastError ? <span className="text-laranja"> ({delivery.lastError})</span> : null}
      </span>
      {delivery.status === 'FAILED' ? (
        <button type="button" onClick={() => onReprocess(delivery.id)} className="font-medium text-carvao/60 underline hover:text-carvao">
          Reprocessar
        </button>
      ) : null}
    </li>
  );
}

function DeliveriesPanel({ automationId }: { automationId: string }): JSX.Element {
  const [deliveries, setDeliveries] = useState<CommentDelivery[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(): Promise<void> {
    setLoading(true);
    const response = await fetch(`/api/comment-automations/${automationId}/deliveries`);
    const body = await response.json();
    setDeliveries(body.deliveries ?? []);
    setLoading(false);
  }

  async function reprocess(deliveryId: string): Promise<void> {
    await fetch(`/api/comment-automations/deliveries/${deliveryId}/reprocess`, { method: 'POST' });
    await load();
  }

  if (deliveries === null) {
    return (
      <button type="button" onClick={() => void load()} disabled={loading} className="text-xs font-medium text-carvao/60 underline hover:text-carvao">
        {loading ? 'Carregando…' : 'Ver entregas'}
      </button>
    );
  }

  return (
    <ul className="mt-2 flex flex-col gap-1 border-t border-carvao/10 pt-2">
      {deliveries.length === 0 ? <li className="py-1.5 text-xs text-carvao/50">Nenhuma entrega ainda.</li> : null}
      {deliveries.map((delivery) => (
        <DeliveryRow key={delivery.id} delivery={delivery} onReprocess={reprocess} />
      ))}
    </ul>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-carvao/5 text-carvao/60',
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  FINISHED: 'bg-carvao/10 text-carvao/50',
};

function AutomationCard({ automation, repliesEnabled }: { automation: AutomationWithPost; repliesEnabled: boolean }): JSX.Element {
  const router = useRouter();

  async function setStatus(status: string): Promise<void> {
    await patchAutomation(automation.id, { status });
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-carvao/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-base font-bold uppercase text-carvao">
            {automation.keyword} <span className="text-xs font-normal text-carvao/50">({automation.matchMode})</span>
          </p>
          <p className="text-sm text-carvao/70">{automation.replyMessage}</p>
          <p className="mt-1 text-xs text-carvao/50">Post: {postLabel(automation.post)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[automation.status] ?? 'bg-carvao/5 text-carvao/60'}`}>
            {automation.status}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${repliesEnabled ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {repliesEnabled ? 'Envio real' : 'Simulação'}
          </span>
        </div>
      </div>
      <div className="flex gap-4 text-xs font-medium">
        {automation.status !== 'ACTIVE' ? (
          <button type="button" onClick={() => void setStatus('ACTIVE')} className="text-carvao/60 underline hover:text-carvao">
            Ativar
          </button>
        ) : null}
        {automation.status === 'ACTIVE' ? (
          <button type="button" onClick={() => void setStatus('PAUSED')} className="text-carvao/60 underline hover:text-carvao">
            Pausar
          </button>
        ) : null}
        {automation.status !== 'FINISHED' ? (
          <button type="button" onClick={() => void setStatus('FINISHED')} className="text-laranja underline">
            Finalizar
          </button>
        ) : null}
      </div>
      <DeliveriesPanel automationId={automation.id} />
    </li>
  );
}

export function AutomationsManager({ automations, publishedPosts, repliesEnabled }: AutomationsManagerProps): JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);

    const response = await fetch('/api/comment-automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, assetUrl: form.assetUrl || undefined }),
    });

    setCreating(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.toString?.() ?? 'Não foi possível criar a automação.');
      return;
    }
    setForm(EMPTY_FORM);
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-5">
      <ul className="flex flex-col gap-3">
        {automations.map((automation) => (
          <AutomationCard key={automation.id} automation={automation} repliesEnabled={repliesEnabled} />
        ))}
        {automations.length === 0 ? <p className="text-sm text-carvao/50">Nenhuma automação cadastrada ainda.</p> : null}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-lg border border-carvao/10 bg-white p-4 shadow-sm">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-carvao">Nova automação</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Post publicado</span>
          <select
            value={form.postId}
            onChange={(event) => setForm((prev) => ({ ...prev, postId: event.target.value }))}
            required
            className={FIELD_CLASSES}
          >
            <option value="" disabled>
              Selecione um post…
            </option>
            {publishedPosts.map((post) => (
              <option key={post.id} value={post.id}>
                {postLabel(post)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Palavra-chave</span>
          <input
            value={form.keyword}
            onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
            required
            className={FIELD_CLASSES}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Tipo de correspondência</span>
          <select
            value={form.matchMode}
            onChange={(event) => setForm((prev) => ({ ...prev, matchMode: event.target.value as KeywordMatchMode }))}
            className={FIELD_CLASSES}
          >
            <option value="CONTAINS_WORD">Contém a palavra</option>
            <option value="EXACT">Exato</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Mensagem da resposta privada</span>
          <textarea
            value={form.replyMessage}
            onChange={(event) => setForm((prev) => ({ ...prev, replyMessage: event.target.value }))}
            required
            rows={3}
            className={FIELD_CLASSES}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-carvao">Link do material (opcional)</span>
          <input
            value={form.assetUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, assetUrl: event.target.value }))}
            type="url"
            className={FIELD_CLASSES}
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
