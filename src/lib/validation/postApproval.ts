export interface ApprovableSlide {
  role: string | null;
  sourceLabel: string | null;
  imageUrl: string | null;
}

export interface ApprovablePost {
  caption: string | null;
  postGoal: string | null;
  ctaKeyword: string | null;
  slides: readonly ApprovableSlide[];
}

// Human-readable reasons a post is not ready to schedule. Returns an
// empty array when the post can be approved. Every check here mirrors a
// "Não permita aprovação se..." rule from the editorial dashboard brief.
export function findApprovalBlockers(post: ApprovablePost): string[] {
  const blockers: string[] = [];

  if (!post.caption || post.caption.trim().length === 0) {
    blockers.push('O post não tem legenda.');
  }

  if (post.postGoal === 'comment_dm' && !post.ctaKeyword) {
    blockers.push('Posts de comentário/DM precisam de uma palavra-chave de CTA.');
  }

  if (post.slides.some((slide) => slide.role === 'evidence' && !slide.sourceLabel)) {
    blockers.push('Existe um slide de evidência sem fonte citada.');
  }

  if (post.slides.some((slide) => !slide.imageUrl)) {
    blockers.push('Existe um slide sem imagem renderizada.');
  }

  if (post.slides.length === 0) {
    blockers.push('O post não tem nenhum slide.');
  }

  return blockers;
}
