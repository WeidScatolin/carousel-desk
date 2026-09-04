import type { DragAction } from '@/lib/kanban/columns';

export interface DragActionInput {
  reason?: string;
  scheduledAt?: string;
}

export interface DragActionResult {
  ok: boolean;
  blockers?: string[];
  error?: string;
}

async function readResult(response: Response): Promise<DragActionResult> {
  if (response.ok) {
    return { ok: true };
  }
  const payload: unknown = await response.json().catch(() => null);
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const blockers = Array.isArray(record.blockers) ? (record.blockers as string[]) : undefined;
  const error = typeof record.error === 'string' ? record.error : undefined;
  return { ok: false, blockers, error };
}

async function postJson(url: string, body: unknown): Promise<DragActionResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readResult(response);
}

export async function runDragAction(action: DragAction, input?: DragActionInput): Promise<DragActionResult> {
  switch (action.type) {
    case 'approve_theme': {
      const response = await fetch(`/api/themes/${action.themeId}/approve`, { method: 'POST' });
      return readResult(response);
    }
    case 'reject_theme': {
      if (!input?.reason) {
        return { ok: false, error: 'Motivo é obrigatório.' };
      }
      return postJson(`/api/themes/${action.themeId}/reject`, { reason: input.reason });
    }
    case 'approve_post': {
      if (!input?.scheduledAt) {
        return { ok: false, error: 'Data/hora é obrigatória.' };
      }
      return postJson(`/api/posts/${action.postId}/approve`, { scheduledAt: input.scheduledAt });
    }
    case 'reject_post': {
      if (!input?.reason) {
        return { ok: false, error: 'Motivo é obrigatório.' };
      }
      return postJson(`/api/posts/${action.postId}/reject`, { reason: input.reason });
    }
  }
}
