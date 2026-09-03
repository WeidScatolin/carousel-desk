// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionDialog } from './ActionDialog';

describe('ActionDialog', () => {
  test('disables confirm until a reason is typed, then calls onConfirm with it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<ActionDialog kind="reason" title="Motivo da rejeição" onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    await user.type(screen.getByLabelText('Motivo'), 'fora do nicho');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onConfirm).toHaveBeenCalledWith('fora do nicho');
  });

  test('calls onCancel without calling onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(<ActionDialog kind="reason" title="Motivo da rejeição" onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('converts the datetime-local value to a full ISO 8601 string on confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<ActionDialog kind="schedule" title="Confirmar agendamento" onConfirm={onConfirm} onCancel={vi.fn()} />);

    const input = screen.getByLabelText('Data e hora do agendamento');
    await user.type(input, '2026-09-05T12:00');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [value] = onConfirm.mock.calls[0] as [string];
    expect(new Date(value).toISOString()).toBe(value);
    expect(value.startsWith('2026-09-05')).toBe(true);
  });
});
