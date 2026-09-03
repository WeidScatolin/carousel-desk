// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { CampaignsManager } from './CampaignsManager';

function buildCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-1',
    name: 'Campanha MAPA',
    keyword: 'MAPA',
    matchMode: 'CONTAINS_WORD' as const,
    assetName: 'Mapa',
    assetUrl: 'https://example.com/mapa.pdf',
    deliveryMessage: 'Aqui está o mapa.',
    qualificationQuestion: 'Qual área consome mais tempo?',
    status: 'DRAFT' as const,
    totalComments: 5,
    matchedComments: 3,
    privateRepliesSent: 2,
    privateRepliesFailed: 1,
    qualifiedLeads: 0,
    instagramMediaId: null,
    post: { id: 'post-1', status: 'scheduled', theme: { headlineSuggestion: 'Agente de IA para atendimento' } },
    leadMagnet: { name: 'Mapa de Oportunidades' },
    ...overrides,
  };
}

describe('CampaignsManager', () => {
  beforeEach(() => {
    refresh.mockReset();
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  test('renders campaign context, counters and status', () => {
    render(<CampaignsManager campaigns={[buildCampaign()]} />);

    expect(screen.getByText('Agente de IA para atendimento')).toBeInTheDocument();
    expect(screen.getAllByText('Rascunho').length).toBeGreaterThan(0);
    expect(screen.getByText('5 comentários')).toBeInTheDocument();
  });

  test('filters by search text (keyword or theme headline)', async () => {
    const user = userEvent.setup();
    render(
      <CampaignsManager
        campaigns={[
          buildCampaign(),
          buildCampaign({ id: 'campaign-2', keyword: 'CHECKLIST', post: { id: 'post-2', status: 'scheduled', theme: { headlineSuggestion: 'Outro tema qualquer' } } }),
        ]}
      />,
    );

    await user.type(screen.getByPlaceholderText('Buscar por palavra-chave ou tema'), 'CHECKLIST');

    expect(screen.queryByText('Agente de IA para atendimento')).not.toBeInTheDocument();
    expect(screen.getByText('Outro tema qualquer')).toBeInTheDocument();
  });

  test('saves edited delivery message via PATCH', async () => {
    const user = userEvent.setup();
    render(<CampaignsManager campaigns={[buildCampaign()]} />);

    const textarea = screen.getByDisplayValue('Aqui está o mapa.');
    await user.clear(textarea);
    await user.type(textarea, 'Nova mensagem');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/campaigns/campaign-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"deliveryMessage":"Nova mensagem"'),
      }),
    );
  });

  test('activates a campaign via the Ativar button', async () => {
    const user = userEvent.setup();
    render(<CampaignsManager campaigns={[buildCampaign()]} />);

    await user.click(screen.getByRole('button', { name: 'Ativar' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/campaigns/campaign-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }),
    );
  });

  test('shows activation blockers instead of refreshing when the API rejects', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ blockers: ['A campanha não tem mensagem de entrega.'] }), { status: 422 }),
    );

    render(<CampaignsManager campaigns={[buildCampaign()]} />);
    await user.click(screen.getByRole('button', { name: 'Ativar' }));

    expect(await screen.findByText('A campanha não tem mensagem de entrega.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  test('loads and displays comment history, with a reprocess button on FAILED events', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          commentEvents: [
            {
              id: 'event-1',
              originalComment: 'Quero o MAPA',
              deliveryStatus: 'FAILED',
              ignoredReason: null,
              errorMessage: 'rate limited',
              simulated: false,
              receivedAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(<CampaignsManager campaigns={[buildCampaign()]} />);
    await user.click(screen.getByRole('button', { name: 'Ver histórico de comentários' }));

    expect(await screen.findByText(/Quero o MAPA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reprocessar' })).toBeInTheDocument();
  });
});
