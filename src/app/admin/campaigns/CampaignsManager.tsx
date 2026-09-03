'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

interface CampaignWithContext {
  id: string;
  name: string;
  keyword: string;
  matchMode: 'EXACT' | 'CONTAINS_WORD';
  assetName: string;
  assetUrl: string;
  deliveryMessage: string;
  qualificationQuestion: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'FINISHED';
  totalComments: number;
  matchedComments: number;
  privateRepliesSent: number;
  privateRepliesFailed: number;
  qualifiedLeads: number;
  instagramMediaId: string | null;
  post: { id: string; status: string; theme: { headlineSuggestion: string } };
  leadMagnet: { name: string } | null;
}

interface CommentEvent {
  id: string;
  originalComment: string;
  deliveryStatus: 'RECEIVED' | 'IGNORED' | 'PENDING' | 'SENT' | 'FAILED';
  ignoredReason: string | null;
  errorMessage: string | null;
  simulated: boolean;
  receivedAt: string;
}

interface CampaignsManagerProps {
  campaigns: CampaignWithContext[];
}

const STATUS_LABELS: Record<CampaignWithContext['status'], string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  FINISHED: 'Encerrada',
};

function CampaignCard({ campaign }: { campaign: CampaignWithContext }): JSX.Element {
  const router = useRouter();
  const [deliveryMessage, setDeliveryMessage] = useState(campaign.deliveryMessage);
  const [qualificationQuestion, setQualificationQuestion] = useState(campaign.qualificationQuestion ?? '');
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<CommentEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  async function patch(data: Record<string, unknown>): Promise<void> {
    setSaving(true);
    setBlockers(null);
    const response = await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setBlockers(payload?.blockers ?? [payload?.error ?? 'Não foi possível salvar.']);
      return;
    }
    router.refresh();
  }

  async function handleSave(): Promise<void> {
    await patch({ deliveryMessage, qualificationQuestion: qualificationQuestion || null });
  }

  async function toggleExpanded(): Promise<void> {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setLoadingEvents(true);
    const response = await fetch(`/api/campaigns/${campaign.id}/comment-events`);
    const data = await response.json();
    setEvents(data.commentEvents ?? []);
    setLoadingEvents(false);
  }

  async function reprocess(eventId: string): Promise<void> {
    await fetch(`/api/comment-events/${eventId}/reprocess`, { method: 'POST' });
    await toggleExpandedRefresh();
  }

  async function toggleExpandedRefresh(): Promise<void> {
    setLoadingEvents(true);
    const response = await fetch(`/api/campaigns/${campaign.id}/comment-events`);
    const data = await response.json();
    setEvents(data.commentEvents ?? []);
    setLoadingEvents(false);
    router.refresh();
  }

  return (
    <li className="rounded border p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{campaign.post.theme.headlineSuggestion}</p>
          <p className="text-xs text-neutral-500">
            Palavra-chave: <span className="font-mono">{campaign.keyword}</span> · Material:{' '}
            {campaign.leadMagnet?.name ?? campaign.assetName}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{STATUS_LABELS[campaign.status]}</span>
      </div>

      <div className="mb-2 flex flex-wrap gap-3 text-xs text-neutral-600">
        <span>{campaign.totalComments} comentários</span>
        <span>{campaign.matchedComments} com palavra-chave</span>
        <span>{campaign.privateRepliesSent} entregues</span>
        <span>{campaign.privateRepliesFailed} falharam</span>
        <span>{campaign.qualifiedLeads} qualificados</span>
      </div>

      <label className="mb-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Mensagem de entrega</span>
        <textarea
          value={deliveryMessage}
          onChange={(event) => setDeliveryMessage(event.target.value)}
          rows={2}
          className="rounded border p-2 text-sm"
        />
      </label>
      <label className="mb-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Pergunta de qualificação</span>
        <input
          value={qualificationQuestion}
          onChange={(event) => setQualificationQuestion(event.target.value)}
          className="rounded border p-2 text-sm"
        />
      </label>

      {blockers ? (
        <ul className="mb-2 list-disc pl-4 text-xs text-red-600">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void handleSave()} className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40">
          Salvar
        </button>
        {campaign.status !== 'ACTIVE' ? (
          <button type="button" disabled={saving} onClick={() => void patch({ status: 'ACTIVE' })} className="rounded border px-3 py-1 text-xs">
            Ativar
          </button>
        ) : null}
        {campaign.status === 'ACTIVE' ? (
          <button type="button" disabled={saving} onClick={() => void patch({ status: 'PAUSED' })} className="rounded border px-3 py-1 text-xs">
            Pausar
          </button>
        ) : null}
        {campaign.status !== 'FINISHED' ? (
          <button type="button" disabled={saving} onClick={() => void patch({ status: 'FINISHED' })} className="rounded border px-3 py-1 text-xs">
            Encerrar
          </button>
        ) : null}
        <button type="button" onClick={() => void toggleExpanded()} className="rounded border px-3 py-1 text-xs">
          {expanded ? 'Ocultar histórico' : 'Ver histórico de comentários'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 border-t pt-3">
          {loadingEvents ? <p className="text-xs text-neutral-500">Carregando…</p> : null}
          {!loadingEvents && events?.length === 0 ? <p className="text-xs text-neutral-500">Nenhum comentário ainda.</p> : null}
          <ul className="flex flex-col gap-2">
            {events?.map((event) => (
              <li key={event.id} className="rounded bg-neutral-50 p-2 text-xs">
                <p className="mb-1">
                  <span className="font-semibold">{event.deliveryStatus}</span>
                  {event.simulated ? <span className="ml-1 text-neutral-500">(simulado)</span> : null}
                  {' — '}
                  {event.originalComment}
                </p>
                {event.ignoredReason ? <p className="text-neutral-500">Motivo: {event.ignoredReason}</p> : null}
                {event.errorMessage ? <p className="text-red-600">Erro: {event.errorMessage}</p> : null}
                {event.deliveryStatus === 'FAILED' ? (
                  <button type="button" onClick={() => void reprocess(event.id)} className="mt-1 text-neutral-700 underline">
                    Reprocessar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function CampaignsManager({ campaigns }: CampaignsManagerProps): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<'ALL' | CampaignWithContext['status']>('ALL');
  const [search, setSearch] = useState('');

  const filtered = campaigns.filter((campaign) => {
    const matchesStatus = statusFilter === 'ALL' || campaign.status === statusFilter;
    const matchesSearch =
      !search.trim() ||
      campaign.keyword.toLowerCase().includes(search.toLowerCase()) ||
      campaign.post.theme.headlineSuggestion.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="rounded border p-2 text-sm"
        >
          <option value="ALL">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por palavra-chave ou tema"
          className="flex-1 rounded border p-2 text-sm"
        />
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
        {filtered.length === 0 ? <p className="text-sm text-neutral-500">Nenhuma campanha encontrada.</p> : null}
      </ul>
    </div>
  );
}
