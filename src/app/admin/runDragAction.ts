import type { DragAction } from '@/lib/kanban/columns';

async function postJson(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function runDragAction(action: DragAction): Promise<void> {
  switch (action.type) {
    case 'approve_theme': {
      await fetch(`/api/themes/${action.themeId}/approve`, { method: 'POST' });
      return;
    }
    case 'reject_theme': {
      const reason = window.prompt('Motivo da rejeição do tema:');
      if (!reason) return;
      await postJson(`/api/themes/${action.themeId}/reject`, { reason });
      return;
    }
    case 'approve_post': {
      const scheduledAt = window.prompt('Data/hora agendada (ISO 8601):');
      if (!scheduledAt) return;
      await postJson(`/api/posts/${action.postId}/approve`, { scheduledAt });
      return;
    }
    case 'reject_post': {
      const reason = window.prompt('Motivo da rejeição do post:');
      if (!reason) return;
      await postJson(`/api/posts/${action.postId}/reject`, { reason });
      return;
    }
  }
}
