'use client';

import type { JSX } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { COLUMN_LABELS, COLUMN_ORDER, resolveDragAction, type ColumnKey } from '@/lib/kanban/columns';
import type { KanbanBoard as KanbanBoardData } from '@/lib/data/kanban';
import { KanbanColumn } from './KanbanColumn';
import { runDragAction } from './runDragAction';

interface KanbanBoardProps {
  board: KanbanBoardData;
}

export function KanbanBoard({ board }: KanbanBoardProps): JSX.Element {
  const router = useRouter();

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

    void runDragAction(action).then(() => router.refresh());
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {COLUMN_ORDER.map((key) => (
          <KanbanColumn key={key} columnKey={key} title={COLUMN_LABELS[key]} board={board} />
        ))}
      </div>
    </DndContext>
  );
}
