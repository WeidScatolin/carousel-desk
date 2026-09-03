'use client';

import { useState, type JSX } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { COLUMN_LABELS, COLUMN_ORDER, resolveDragAction, type ColumnKey, type DragAction } from '@/lib/kanban/columns';
import type { KanbanBoard as KanbanBoardData } from '@/lib/data/kanban';
import { KanbanColumn } from './KanbanColumn';
import { runDragAction } from './runDragAction';
import { ActionDialog } from './ActionDialog';

interface KanbanBoardProps {
  board: KanbanBoardData;
}

interface PendingAction {
  action: DragAction;
  kind: 'schedule' | 'reason';
  title: string;
}

function describePendingAction(action: DragAction): PendingAction | null {
  if (action.type === 'approve_post') {
    return { action, kind: 'schedule', title: 'Confirmar agendamento' };
  }
  if (action.type === 'reject_theme' || action.type === 'reject_post') {
    return { action, kind: 'reason', title: 'Motivo da rejeição' };
  }
  return null;
}

export function KanbanBoard({ board }: KanbanBoardProps): JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);

  function handleDragEnd(event: DragEndEvent): void {
    const from = event.active.data.current?.column as ColumnKey | undefined;
    const to = event.over?.data.current?.column as ColumnKey | undefined;
    const cardType = event.active.data.current?.cardType as 'theme' | 'post' | undefined;

    if (!from || !to || !cardType) {
      return;
    }

    const action = resolveDragAction(from, to, { cardType, id: String(event.active.id) });
    if (!action) {
      return;
    }

    // approve_theme needs no extra input — every other action needs a
    // confirmed value from the user before anything is sent.
    const described = describePendingAction(action);
    if (!described) {
      void runDragAction(action).then((result) => {
        if (result.ok) {
          router.refresh();
        } else {
          setBlockers(result.blockers ?? [result.error ?? 'Não foi possível concluir a ação.']);
        }
      });
      return;
    }
    setPending(described);
  }

  async function handleConfirm(value: string): Promise<void> {
    if (!pending) {
      return;
    }
    const input = pending.kind === 'schedule' ? { scheduledAt: value } : { reason: value };
    const result = await runDragAction(pending.action, input);
    setPending(null);
    if (result.ok) {
      router.refresh();
    } else {
      setBlockers(result.blockers ?? [result.error ?? 'Não foi possível concluir a ação.']);
    }
  }

  return (
    <>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto p-4">
          {COLUMN_ORDER.map((key) => (
            <KanbanColumn key={key} columnKey={key} title={COLUMN_LABELS[key]} board={board} />
          ))}
        </div>
      </DndContext>
      {pending ? (
        <ActionDialog
          kind={pending.kind}
          title={pending.title}
          onConfirm={(value) => void handleConfirm(value)}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {blockers ? (
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-sm rounded bg-red-50 p-4 text-sm text-red-800 shadow-lg">
          <p className="mb-2 font-bold">Não foi possível concluir:</p>
          <ul className="list-disc pl-4">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs underline" onClick={() => setBlockers(null)}>
            Fechar
          </button>
        </div>
      ) : null}
    </>
  );
}
