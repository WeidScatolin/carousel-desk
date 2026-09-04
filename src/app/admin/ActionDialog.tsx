'use client';

import { useState, type JSX } from 'react';

type ActionDialogProps = {
  kind: 'schedule' | 'reason';
  title: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

// datetime-local gives "2026-09-05T12:00" with no timezone — the API
// schema requires a full ISO 8601 datetime, so it's converted here,
// once, at the confirm boundary rather than trusting the raw input.
function toIsoDateTime(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function ActionDialog({ kind, title, onConfirm, onCancel }: ActionDialogProps): JSX.Element {
  const [value, setValue] = useState('');

  function handleConfirm(): void {
    if (!value.trim()) {
      return;
    }
    onConfirm(kind === 'schedule' ? toIsoDateTime(value) : value);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carvao/60">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-96 rounded-lg bg-creme p-5 shadow-xl">
        <h2 className="mb-3 font-heading text-base font-bold text-carvao">{title}</h2>
        {kind === 'schedule' ? (
          <input
            type="datetime-local"
            aria-label="Data e hora do agendamento"
            className="mb-4 w-full rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <textarea
            aria-label="Motivo"
            className="mb-4 w-full rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none"
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-2 text-sm font-medium text-carvao/60 hover:text-carvao" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="rounded bg-carvao px-4 py-2 text-sm font-semibold uppercase tracking-wide text-creme transition hover:bg-laranja disabled:opacity-40"
            disabled={!value.trim()}
            onClick={handleConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
