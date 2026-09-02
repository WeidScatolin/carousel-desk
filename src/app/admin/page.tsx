import type { JSX } from 'react';
import { getKanbanBoard } from '@/lib/data/kanban';
import { KanbanBoard } from './KanbanBoard';

export default async function AdminPage(): Promise<JSX.Element> {
  const board = await getKanbanBoard();

  return <KanbanBoard board={board} />;
}
