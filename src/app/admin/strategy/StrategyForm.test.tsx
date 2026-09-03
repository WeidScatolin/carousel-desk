// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { StrategyForm } from './StrategyForm';
import type { BrandStrategy } from '@/generated/prisma/client';

const existingStrategy: BrandStrategy = {
  id: 'brand-1',
  name: 'Estratégia atual',
  positioning: 'pos',
  targetAudience: 'aud',
  coreProblem: 'problem',
  promise: 'promise',
  offerDescription: 'offer',
  tone: 'tone',
  defaultCtaKeyword: 'MAPA',
  instagramHandle: '@carousel-desk',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StrategyForm', () => {
  beforeEach(() => {
    refresh.mockReset();
    global.fetch = vi.fn();
  });

  test('pre-fills the form with the existing strategy', () => {
    render(<StrategyForm strategy={existingStrategy} />);

    expect(screen.getByDisplayValue('Estratégia atual')).toBeInTheDocument();
    expect(screen.getByDisplayValue('@carousel-desk')).toBeInTheDocument();
  });

  test('starts with empty fields when there is no strategy yet', () => {
    render(<StrategyForm strategy={null} />);

    const nameInput = screen.getByLabelText('Nome') as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  test('submits the edited values via PATCH and shows a saved confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ strategy: {} }), { status: 200 }));

    render(<StrategyForm strategy={existingStrategy} />);

    const nameInput = screen.getByLabelText('Nome');
    await user.clear(nameInput);
    await user.type(nameInput, 'Novo nome');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/brand-strategy',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"name":"Novo nome"'),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  test('shows an error message when the save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(new Response('{}', { status: 400 }));

    render(<StrategyForm strategy={existingStrategy} />);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument();
  });
});
