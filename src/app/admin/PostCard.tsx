'use client';

import { useState, type JSX } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { ColumnKey } from '@/lib/kanban/columns';
import type { PostWithSlides } from '@/lib/data/posts';
import { PostDrawer } from './PostDrawer';

interface PostCardProps {
  post: PostWithSlides;
  column: ColumnKey;
}

export function PostCard({ post, column }: PostCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: post.id,
    data: { column, cardType: 'post' as const },
  });
  const [showDrawer, setShowDrawer] = useState(false);
  const thumbnail = post.slides[0]?.imageUrl;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={() => setShowDrawer(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setShowDrawer(true);
      }}
      className="cursor-pointer rounded-lg border border-carvao/10 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="Miniatura do carrossel" className="mb-2 h-24 w-auto rounded object-cover" />
      ) : null}
      <p className="text-sm font-semibold uppercase tracking-wide text-carvao/60">{post.status}</p>
      {post.rejectionReason ? (
        <p className="mt-1 text-xs text-carvao/50">{post.rejectionReason}</p>
      ) : null}
      <span className="mt-2 inline-block text-xs font-medium text-carvao/40">Ver detalhes →</span>
      {showDrawer ? <PostDrawer post={post} onClose={() => setShowDrawer(false)} /> : null}
    </div>
  );
}
