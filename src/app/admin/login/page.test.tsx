// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    global.fetch = vi.fn();
  });

  test('shows an error message when login fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuário'), 'admin');
    await user.type(screen.getByPlaceholderText('Senha'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Usuário ou senha inválidos')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  test('redirects to /admin when login succeeds', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuário'), 'admin');
    await user.type(screen.getByPlaceholderText('Senha'), 'correct');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(push).toHaveBeenCalledWith('/admin');
  });
});
