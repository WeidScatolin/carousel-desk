// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { KanbanBoard } from './KanbanBoard';
import type { KanbanBoard as KanbanBoardData } from '@/lib/data/kanban';

const emptyBoard: KanbanBoardData = {
  suggested: [{ id: 'theme-1', headlineSuggestion: 'Tema X' } as never],
  generating: [],
  pendingApproval: [],
  scheduled: [],
  published: [],
  rejectedThemes: [],
  rejectedPosts: [],
};

describe('KanbanBoard', () => {
  test('renders all six column labels', () => {
    render(<KanbanBoard board={emptyBoard} />);

    expect(screen.getByText('Temas sugeridos')).toBeInTheDocument();
    expect(screen.getByText('Gerando')).toBeInTheDocument();
    expect(screen.getByText('Aguardando aprovação')).toBeInTheDocument();
    expect(screen.getByText('Agendado')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();
  });

  test('renders a theme card headline in the suggested column', () => {
    render(<KanbanBoard board={emptyBoard} />);

    expect(screen.getByText('Tema X')).toBeInTheDocument();
  });
});
