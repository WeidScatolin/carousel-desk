// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { LeadMagnetsManager } from './LeadMagnetsManager';
import type { LeadMagnet } from '@/generated/prisma/client';

const leadMagnet: LeadMagnet = {
  id: 'lm-1',
  name: 'Mapa de Oportunidades',
  description: 'Descrição do material.',
  deliveryUrl: 'https://example.com/mapa.pdf',
  ctaKeyword: 'MAPA',
  qualificationQuestion: 'Qual área consome mais tempo?',
  active: true,
  createdAt: new Date(),
};

describe('LeadMagnetsManager', () => {
  beforeEach(() => {
    refresh.mockReset();
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  });

  test('lists existing lead magnets with their keyword and status', () => {
    render(<LeadMagnetsManager leadMagnets={[leadMagnet]} />);

    expect(screen.getByText('Mapa de Oportunidades', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  test('shows an empty state when there are no lead magnets yet', () => {
    render(<LeadMagnetsManager leadMagnets={[]} />);

    expect(screen.getByText('Nenhum lead magnet cadastrado ainda.')).toBeInTheDocument();
  });

  test('toggles active status via PATCH', async () => {
    const user = userEvent.setup();
    render(<LeadMagnetsManager leadMagnets={[leadMagnet]} />);

    await user.click(screen.getByRole('button', { name: 'Desativar' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/lead-magnets/lm-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ active: false }) }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  test('deletes a lead magnet via DELETE', async () => {
    const user = userEvent.setup();
    render(<LeadMagnetsManager leadMagnets={[leadMagnet]} />);

    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(global.fetch).toHaveBeenCalledWith('/api/lead-magnets/lm-1', { method: 'DELETE' });
  });

  test('creates a new lead magnet from the form', async () => {
    const user = userEvent.setup();
    render(<LeadMagnetsManager leadMagnets={[]} />);

    await user.type(screen.getByLabelText('Nome'), 'Checklist');
    await user.type(screen.getByLabelText('Descrição'), 'Um checklist útil.');
    await user.type(screen.getByLabelText('URL de entrega'), 'https://example.com/checklist.pdf');
    await user.type(screen.getByLabelText('Palavra-chave'), 'CHECKLIST');
    await user.type(screen.getByLabelText('Pergunta de qualificação'), 'Qual seu maior desafio?');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/lead-magnets',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"Checklist"'),
      }),
    );
  });
});
