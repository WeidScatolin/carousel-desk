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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-96 rounded bg-white p-4 shadow-lg">
        <h2 className="mb-3 text-sm font-bold text-neutral-900">{title}</h2>
        {kind === 'schedule' ? (
          <input
            type="datetime-local"
            aria-label="Data e hora do agendamento"
            className="mb-4 w-full rounded border p-2 text-sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <textarea
            aria-label="Motivo"
            className="mb-4 w-full rounded border p-2 text-sm"
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1 text-sm text-neutral-600" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40"
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
