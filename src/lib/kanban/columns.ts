export type ColumnKey =
  | 'suggested'
  | 'generating'
  | 'pending_approval'
  | 'scheduled'
  | 'published'
  | 'rejected';

export const COLUMN_ORDER: ColumnKey[] = [
  'suggested',
  'generating',
  'pending_approval',
  'scheduled',
  'published',
  'rejected',
];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  suggested: 'Temas sugeridos',
  generating: 'Gerando',
  pending_approval: 'Aguardando aprovação',
  scheduled: 'Agendado',
  published: 'Publicado',
  rejected: 'Rejeitado',
};

export type DragAction =
  | { type: 'approve_theme'; themeId: string }
  | { type: 'reject_theme'; themeId: string }
  | { type: 'approve_post'; postId: string }
  | { type: 'reject_post'; postId: string };

interface DraggableCard {
  cardType: 'theme' | 'post';
  id: string;
}

export function resolveDragAction(from: ColumnKey, to: ColumnKey, card: DraggableCard): DragAction | null {
  if (from === to) {
    return null;
  }

  if (card.cardType === 'theme' && from === 'suggested' && to === 'generating') {
    return { type: 'approve_theme', themeId: card.id };
  }

  if (card.cardType === 'theme' && from === 'suggested' && to === 'rejected') {
    return { type: 'reject_theme', themeId: card.id };
  }

  if (card.cardType === 'post' && from === 'pending_approval' && to === 'scheduled') {
    return { type: 'approve_post', postId: card.id };
  }

  if (card.cardType === 'post' && from === 'pending_approval' && to === 'rejected') {
    return { type: 'reject_post', postId: card.id };
  }

  return null;
}
