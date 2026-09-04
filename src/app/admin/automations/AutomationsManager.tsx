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
    <li className="flex items-center justify-between gap-2 border-b py-1 text-xs">
      <span>
        {delivery.instagramUsername ?? 'anônimo'} — <span className="font-mono">{delivery.status}</span>
        {delivery.lastError ? <span className="text-red-600"> ({delivery.lastError})</span> : null}
      </span>
      {delivery.status === 'FAILED' ? (
        <button type="button" onClick={() => onReprocess(delivery.id)} className="text-neutral-600 underline">
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
      <button type="button" onClick={() => void load()} disabled={loading} className="text-xs text-neutral-600 underline">
        {loading ? 'Carregando…' : 'Ver entregas'}
      </button>
    );
  }

  return (
    <ul className="mt-2 flex flex-col gap-1">
      {deliveries.length === 0 ? <li className="text-xs text-neutral-500">Nenhuma entrega ainda.</li> : null}
      {deliveries.map((delivery) => (
        <DeliveryRow key={delivery.id} delivery={delivery} onReprocess={reprocess} />
      ))}
    </ul>
  );
}

function AutomationCard({ automation, repliesEnabled }: { automation: AutomationWithPost; repliesEnabled: boolean }): JSX.Element {
  const router = useRouter();

  async function setStatus(status: string): Promise<void> {
    await patchAutomation(automation.id, { status });
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 rounded border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {automation.keyword} <span className="text-xs font-normal text-neutral-500">({automation.matchMode})</span>
          </p>
          <p className="text-sm text-neutral-600">{automation.replyMessage}</p>
          <p className="text-xs text-neutral-500">Post: {postLabel(automation.post)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{automation.status}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${repliesEnabled ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {repliesEnabled ? 'Envio real' : 'Simulação'}
          </span>
        </div>
      </div>
      <div className="flex gap-3 text-xs">
        {automation.status !== 'ACTIVE' ? (
          <button type="button" onClick={() => void setStatus('ACTIVE')} className="text-neutral-600 underline">
            Ativar
          </button>
        ) : null}
        {automation.status === 'ACTIVE' ? (
          <button type="button" onClick={() => void setStatus('PAUSED')} className="text-neutral-600 underline">
            Pausar
          </button>
        ) : null}
        {automation.status !== 'FINISHED' ? (
          <button type="button" onClick={() => void setStatus('FINISHED')} className="text-red-600 underline">
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
    <div className="flex max-w-2xl flex-col gap-6 p-4">
      <ul className="flex flex-col gap-2">
        {automations.map((automation) => (
          <AutomationCard key={automation.id} automation={automation} repliesEnabled={repliesEnabled} />
        ))}
        {automations.length === 0 ? <p className="text-sm text-neutral-500">Nenhuma automação cadastrada ainda.</p> : null}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded border p-3">
        <h2 className="text-sm font-bold">Nova automação</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span>Post publicado</span>
          <select
            value={form.postId}
            onChange={(event) => setForm((prev) => ({ ...prev, postId: event.target.value }))}
            required
            className="rounded border p-2"
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
          <span>Palavra-chave</span>
          <input
            value={form.keyword}
            onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
            required
            className="rounded border p-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Tipo de correspondência</span>
          <select
            value={form.matchMode}
            onChange={(event) => setForm((prev) => ({ ...prev, matchMode: event.target.value as KeywordMatchMode }))}
            className="rounded border p-2"
          >
            <option value="CONTAINS_WORD">Contém a palavra</option>
            <option value="EXACT">Exato</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Mensagem da resposta privada</span>
          <textarea
            value={form.replyMessage}
            onChange={(event) => setForm((prev) => ({ ...prev, replyMessage: event.target.value }))}
            required
            rows={3}
            className="rounded border p-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Link do material (opcional)</span>
          <input
            value={form.assetUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, assetUrl: event.target.value }))}
            type="url"
            className="rounded border p-2"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={creating}
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {creating ? 'Criando…' : 'Criar'}
        </button>
      </form>
    </div>
  );
}
