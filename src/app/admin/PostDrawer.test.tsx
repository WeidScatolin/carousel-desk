// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { PostDrawer } from './PostDrawer';
import type { PostWithSlides } from '@/lib/data/posts';

function buildPost(overrides: Partial<PostWithSlides> = {}): PostWithSlides {
  return {
    id: 'post-1',
    themeId: 'theme-1',
    status: 'pending_approval',
    scheduledAt: null,
    publishedAt: null,
    instagramPostId: null,
    errorMessage: null,
    rejectionReason: null,
    createdAt: new Date(),
    caption: 'Legenda atual',
    ctaKeyword: null,
    postGoal: null,
    contentPillar: null,
    funnelStage: null,
    leadMagnetId: null,
    theme: {
      id: 'theme-1',
      sourceUrl: 'https://techcrunch.com/artigo',
      hasSufficientEvidence: true,
    } as never,
    leadMagnet: null,
    slides: [
      {
        id: 'slide-1',
        postId: 'post-1',
        order: 0,
        template: 'cover_cinematic',
        headline: 'Título atual',
        body: 'Corpo atual',
        htmlContent: '<html></html>',
        imageUrl: 'https://cdn.test/slide-1.png',
        cloudinaryPublicId: 'id-1',
        imageSource: 'stock',
        sourceImageUrl: null,
        imageDeletedAt: null,
        role: 'cover',
        accentPhrase: null,
        kicker: null,
        sourceLabel: null,
        visualType: 'main_image',
        visualInstructions: null,
      } as never,
    ],
    ...overrides,
  } as PostWithSlides;
}

describe('PostDrawer', () => {
  beforeEach(() => {
    refresh.mockReset();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/lead-magnets') {
        return Promise.resolve(new Response(JSON.stringify({ leadMagnets: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
  });

  test('pre-fills the selected slide headline/body from real stored values', () => {
    render(<PostDrawer post={buildPost()} onClose={vi.fn()} />);

    expect(screen.getByDisplayValue('Título atual')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Corpo atual')).toBeInTheDocument();
  });

  test('shows the evidence warning when the theme has insufficient evidence', () => {
    render(<PostDrawer post={buildPost({ theme: { id: 'theme-1', sourceUrl: 'https://x.com', hasSufficientEvidence: false } as never })} onClose={vi.fn()} />);

    expect(screen.getByText(/Evidência insuficiente/)).toBeInTheDocument();
  });

  test('links to the source article', () => {
    render(<PostDrawer post={buildPost()} onClose={vi.fn()} />);

    expect(screen.getByRole('link', { name: /Ver artigo-fonte/ })).toHaveAttribute('href', 'https://techcrunch.com/artigo');
  });

  test('saves the edited slide via PATCH', async () => {
    const user = userEvent.setup();
    render(<PostDrawer post={buildPost()} onClose={vi.fn()} />);

    const headline = screen.getByDisplayValue('Título atual');
    await user.clear(headline);
    await user.type(headline, 'Novo título');
    await user.click(screen.getByRole('button', { name: 'Salvar e regenerar este slide' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/slides/slide-1',
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"headline":"Novo título"') }),
    );
  });

  test('saves the caption via PATCH on the post', async () => {
    const user = userEvent.setup();
    render(<PostDrawer post={buildPost()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Salvar legenda/CTA' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/posts/post-1',
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"caption":"Legenda atual"') }),
    );
  });

  test('offers the regenerate-carousel button for a pending_approval post', () => {
    render(<PostDrawer post={buildPost({ status: 'pending_approval' })} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Regenerar carrossel inteiro' })).toBeInTheDocument();
  });

  test('hides the regenerate-carousel button once the post is scheduled', () => {
    render(<PostDrawer post={buildPost({ status: 'scheduled' })} onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Regenerar carrossel inteiro' })).not.toBeInTheDocument();
  });

  test('closes via the Fechar button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PostDrawer post={buildPost()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalled();
  });
});
