// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AutomationsManager } from './AutomationsManager';
import type { CommentAutomation } from '@/generated/prisma/client';

const post = { id: 'post-1', instagramPostId: 'ig-media-1', caption: 'Legenda de teste' };

const automation: CommentAutomation & { post: typeof post } = {
  id: 'automation-1',
  postId: 'post-1',
  instagramMediaId: 'ig-media-1',
  keyword: 'MAPA',
  normalizedKeyword: 'MAPA',
  matchMode: 'CONTAINS_WORD',
  replyMessage: 'Aqui está o mapa!',
  assetUrl: null,
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
  post,
};

describe('AutomationsManager', () => {
  beforeEach(() => {
    refresh.mockReset();
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  });

  test('lists existing automations with their keyword and status', () => {
    render(<AutomationsManager automations={[automation]} publishedPosts={[post]} repliesEnabled={false} />);

    expect(screen.getAllByText('MAPA', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText('Simulação')).toBeInTheDocument();
  });

  test('shows "Envio real" when the feature flag is on', () => {
    render(<AutomationsManager automations={[automation]} publishedPosts={[post]} repliesEnabled />);

    expect(screen.getByText('Envio real')).toBeInTheDocument();
  });

  test('shows an empty state when there are no automations yet', () => {
    render(<AutomationsManager automations={[]} publishedPosts={[post]} repliesEnabled={false} />);

    expect(screen.getByText('Nenhuma automação cadastrada ainda.')).toBeInTheDocument();
  });

  test('activates a DRAFT automation via PATCH', async () => {
    const user = userEvent.setup();
    render(<AutomationsManager automations={[automation]} publishedPosts={[post]} repliesEnabled={false} />);

    await user.click(screen.getByRole('button', { name: 'Ativar' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/comment-automations/automation-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  test('creates a new automation from the form', async () => {
    const user = userEvent.setup();
    render(<AutomationsManager automations={[]} publishedPosts={[post]} repliesEnabled={false} />);

    await user.selectOptions(screen.getByLabelText('Post publicado'), 'post-1');
    await user.type(screen.getByLabelText('Palavra-chave'), 'MAPA');
    await user.type(screen.getByLabelText('Mensagem da resposta privada'), 'Aqui está!');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/comment-automations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"keyword":"MAPA"'),
      }),
    );
  });
});
