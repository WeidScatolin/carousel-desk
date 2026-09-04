'use client';

import { useState, type JSX } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
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
  // Without a minimum drag distance, dnd-kit's PointerSensor treats any
  // pointerdown+move as a drag start — and the browser then suppresses
  // the native click event that would otherwise follow, so clicking a
  // card (even with zero visible movement, e.g. a trackpad) silently
  // does nothing.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-laranja/20 bg-white p-4 text-sm text-carvao shadow-xl">
          <p className="mb-2 font-heading font-bold uppercase text-laranja">Não foi possível concluir</p>
          <ul className="list-disc pl-4 text-carvao/80">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs font-medium text-carvao/50 underline hover:text-laranja" onClick={() => setBlockers(null)}>
            Fechar
          </button>
        </div>
      ) : null}
    </>
  );
}
