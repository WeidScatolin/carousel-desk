'use client';

import type { JSX } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Theme } from '@/generated/prisma/client';
import type { ColumnKey } from '@/lib/kanban/columns';

interface ThemeCardProps {
  theme: Theme;
  column: ColumnKey;
}

export function ThemeCard({ theme, column }: ThemeCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: theme.id,
    data: { column, cardType: 'theme' as const },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className="rounded border bg-white p-3"
    >
      <p className="font-semibold">{theme.headlineSuggestion}</p>
      {theme.rejectionReason ? (
        <p className="mt-1 text-xs text-neutral-500">{theme.rejectionReason}</p>
      ) : null}
    </div>
  );
}
