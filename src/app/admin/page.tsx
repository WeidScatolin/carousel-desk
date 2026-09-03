import type { JSX } from 'react';
import { getKanbanBoard } from '@/lib/data/kanban';
import { AdminNav } from './AdminNav';
import { KanbanBoard } from './KanbanBoard';

export default async function AdminPage(): Promise<JSX.Element> {
  const board = await getKanbanBoard();

  return (
    <>
      <AdminNav />
      <KanbanBoard board={board} />
    </>
  );
}
