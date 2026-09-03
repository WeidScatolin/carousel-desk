import { describe, expect, test } from 'vitest';
import { findApprovalBlockers, type ApprovablePost } from './postApproval';

const readyPost: ApprovablePost = {
  caption: 'Legenda pronta',
  postGoal: 'follow',
  ctaKeyword: null,
  slides: [
    { role: 'cover', sourceLabel: null, imageUrl: 'https://cdn.test/1.png' },
    { role: 'evidence', sourceLabel: 'TechCrunch, 2026', imageUrl: 'https://cdn.test/2.png' },
  ],
};

describe('findApprovalBlockers', () => {
  test('returns no blockers for a fully ready post', () => {
    expect(findApprovalBlockers(readyPost)).toEqual([]);
  });

  test('blocks when there is no caption', () => {
    const blockers = findApprovalBlockers({ ...readyPost, caption: null });
    expect(blockers).toContain('O post não tem legenda.');
  });

  test('blocks when caption is only whitespace', () => {
    const blockers = findApprovalBlockers({ ...readyPost, caption: '   ' });
    expect(blockers).toContain('O post não tem legenda.');
  });

  test('blocks a comment_dm post with no ctaKeyword', () => {
    const blockers = findApprovalBlockers({ ...readyPost, postGoal: 'comment_dm', ctaKeyword: null });
    expect(blockers).toContain('Posts de comentário/DM precisam de uma palavra-chave de CTA.');
  });

  test('does not block a comment_dm post that has a ctaKeyword', () => {
    const blockers = findApprovalBlockers({ ...readyPost, postGoal: 'comment_dm', ctaKeyword: 'MAPA' });
    expect(blockers).not.toContain('Posts de comentário/DM precisam de uma palavra-chave de CTA.');
  });

  test('blocks when an evidence slide has no sourceLabel', () => {
    const blockers = findApprovalBlockers({
      ...readyPost,
      slides: [{ role: 'evidence', sourceLabel: null, imageUrl: 'https://cdn.test/1.png' }],
    });
    expect(blockers).toContain('Existe um slide de evidência sem fonte citada.');
  });

  test('does not block a non-evidence slide for missing sourceLabel', () => {
    const blockers = findApprovalBlockers({
      ...readyPost,
      slides: [{ role: 'framework', sourceLabel: null, imageUrl: 'https://cdn.test/1.png' }],
    });
    expect(blockers).not.toContain('Existe um slide de evidência sem fonte citada.');
  });

  test('blocks when a slide has no rendered image', () => {
    const blockers = findApprovalBlockers({
      ...readyPost,
      slides: [{ role: 'cover', sourceLabel: null, imageUrl: null }],
    });
    expect(blockers).toContain('Existe um slide sem imagem renderizada.');
  });

  test('blocks when the post has no slides at all', () => {
    const blockers = findApprovalBlockers({ ...readyPost, slides: [] });
    expect(blockers).toContain('O post não tem nenhum slide.');
  });

  test('returns every applicable blocker at once, not just the first', () => {
    const blockers = findApprovalBlockers({
      caption: null,
      postGoal: 'comment_dm',
      ctaKeyword: null,
      slides: [],
    });
    expect(blockers.length).toBeGreaterThan(1);
  });
});
