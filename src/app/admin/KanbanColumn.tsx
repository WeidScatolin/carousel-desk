'use client';

import type { JSX } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { ColumnKey } from '@/lib/kanban/columns';
import type { KanbanBoard } from '@/lib/data/kanban';
import { ThemeCard } from './ThemeCard';
import { PostCard } from './PostCard';

interface KanbanColumnProps {
  columnKey: ColumnKey;
  title: string;
  board: KanbanBoard;
}

export function KanbanColumn({ columnKey, title, board }: KanbanColumnProps): JSX.Element {
  const { setNodeRef } = useDroppable({ id: columnKey, data: { column: columnKey } });

  const themes = columnKey === 'suggested' ? board.suggested : columnKey === 'rejected' ? board.rejectedThemes : [];
  const posts =
    columnKey === 'generating'
      ? board.generating
      : columnKey === 'pending_approval'
        ? board.pendingApproval
        : columnKey === 'scheduled'
          ? board.scheduled
          : columnKey === 'published'
            ? board.published
            : columnKey === 'rejected'
              ? board.rejectedPosts
              : [];

  return (
    <div ref={setNodeRef} className="w-72 shrink-0 rounded-xl bg-carvao/5 p-3">
      <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wider text-carvao/70">{title}</h2>
      <div className="flex flex-col gap-2">
        {themes.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} column={columnKey} />
        ))}
        {posts.map((post) => (
          <PostCard key={post.id} post={post} column={columnKey} />
        ))}
      </div>
    </div>
  );
}
