'use client';

import type { JSX } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { ColumnKey } from '@/lib/kanban/columns';
import type { ThemeWithBrief } from '@/lib/data/themes';

interface ThemeCardProps {
  theme: ThemeWithBrief;
  column: ColumnKey;
}

const PILLAR_LABELS: Record<string, string> = {
  radar: 'Radar',
  blueprint: 'Blueprint',
  diagnostic: 'Diagnóstico',
  proof: 'Prova',
};

const GOAL_LABELS: Record<string, string> = {
  follow: 'Follow',
  save_share: 'Salvar/compartilhar',
  comment_dm: 'Comentário → DM',
  offer: 'Oferta',
};

export function ThemeCard({ theme, column }: ThemeCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: theme.id,
    data: { column, cardType: 'theme' as const },
  });
  const brief = theme.contentBrief;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className="rounded-lg border border-carvao/10 bg-white p-3 shadow-sm"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-semibold text-carvao">{theme.headlineSuggestion}</p>
        {brief ? (
          <span className="shrink-0 rounded-full bg-carvao px-2 py-0.5 text-xs font-bold text-creme">
            {brief.totalScore}
          </span>
        ) : null}
      </div>
      {brief ? (
        <div className="mb-2 flex flex-wrap gap-1">
          <span className="rounded bg-carvao/5 px-2 py-0.5 text-xs font-medium text-carvao/70">
            {PILLAR_LABELS[brief.contentPillar] ?? brief.contentPillar}
          </span>
          <span className="rounded bg-carvao/5 px-2 py-0.5 text-xs font-medium text-carvao/70">
            {GOAL_LABELS[brief.postGoal] ?? brief.postGoal}
          </span>
        </div>
      ) : null}
      {brief ? <p className="mb-2 text-xs text-carvao/60">{brief.strategicRationale}</p> : null}
      {!theme.hasSufficientEvidence ? (
        <p className="mb-2 text-xs font-semibold text-laranja">⚠ Evidência insuficiente no artigo-fonte</p>
      ) : null}
      <a
        href={theme.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-xs font-medium text-carvao/50 underline hover:text-laranja"
      >
        Fonte ↗
      </a>
      {theme.rejectionReason ? (
        <p className="mt-1 text-xs text-carvao/50">{theme.rejectionReason}</p>
      ) : null}
    </div>
  );
}
