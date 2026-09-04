'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandStrategy } from '@/generated/prisma/client';

interface StrategyFormProps {
  strategy: BrandStrategy | null;
}

const FIELDS: Array<{ name: keyof BrandStrategyFields; label: string; multiline?: boolean }> = [
  { name: 'name', label: 'Nome' },
  { name: 'positioning', label: 'Posicionamento', multiline: true },
  { name: 'targetAudience', label: 'Público', multiline: true },
  { name: 'coreProblem', label: 'Problema central', multiline: true },
  { name: 'promise', label: 'Promessa', multiline: true },
  { name: 'offerDescription', label: 'Oferta futura', multiline: true },
  { name: 'tone', label: 'Tom', multiline: true },
  { name: 'defaultCtaKeyword', label: 'Palavra-chave padrão de CTA' },
  { name: 'instagramHandle', label: 'Handle do Instagram' },
];

type BrandStrategyFields = Omit<BrandStrategy, 'id' | 'active' | 'createdAt' | 'updatedAt'>;

const EMPTY: BrandStrategyFields = {
  name: '',
  positioning: '',
  targetAudience: '',
  coreProblem: '',
  promise: '',
  offerDescription: '',
  tone: '',
  defaultCtaKeyword: '',
  instagramHandle: '',
};

export function StrategyForm({ strategy }: StrategyFormProps): JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState<BrandStrategyFields>(strategy ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const response = await fetch('/api/brand-strategy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setSaving(false);
    if (!response.ok) {
      setError('Não foi possível salvar. Confira os campos obrigatórios.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4 p-4">
      {FIELDS.map((field) => (
        <label key={field.name} className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-neutral-700">{field.label}</span>
          {field.multiline ? (
            <textarea
              value={values[field.name]}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
              rows={2}
              required
              className="rounded border p-2"
            />
          ) : (
            <input
              value={values[field.name]}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
              required
              className="rounded border p-2"
            />
          )}
        </label>
      ))}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700">Salvo.</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
