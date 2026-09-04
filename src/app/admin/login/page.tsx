'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
      }),
    });

    if (!response.ok) {
      setError('Usuário ou senha inválidos');
      return;
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-carvao">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-3 rounded-xl bg-creme p-8 shadow-2xl">
        <h1 className="mb-2 font-heading text-2xl font-extrabold uppercase text-carvao">
          carousel<span className="text-laranja">.</span>desk
        </h1>
        <input
          name="username"
          placeholder="Usuário"
          required
          className="rounded border border-carvao/15 bg-white p-2.5 text-sm text-carvao focus:border-laranja focus:outline-none"
        />
        <input
          name="password"
          type="password"
          placeholder="Senha"
          required
          className="rounded border border-carvao/15 bg-white p-2.5 text-sm text-carvao focus:border-laranja focus:outline-none"
        />
        {error ? <p className="text-sm font-medium text-laranja">{error}</p> : null}
        <button
          type="submit"
          className="mt-1 rounded bg-carvao p-2.5 text-sm font-semibold uppercase tracking-wide text-creme transition hover:bg-laranja"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
