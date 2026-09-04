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
      className="rounded border bg-white p-3"
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="Miniatura do carrossel" className="mb-2 h-24 w-auto rounded object-cover" />
      ) : null}
      <p className="text-sm text-neutral-500">{post.status}</p>
      {post.rejectionReason ? (
        <p className="mt-1 text-xs text-neutral-500">{post.rejectionReason}</p>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setShowDrawer(true);
        }}
        className="mt-2 text-xs text-neutral-600 underline"
      >
        Ver detalhes
      </button>
      {showDrawer ? <PostDrawer post={post} onClose={() => setShowDrawer(false)} /> : null}
    </div>
  );
}
