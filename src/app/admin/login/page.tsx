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
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="flex w-72 flex-col gap-3">
        <h1 className="text-lg font-bold">carousel-desk</h1>
        <input name="username" placeholder="Usuário" required className="border p-2" />
        <input name="password" type="password" placeholder="Senha" required className="border p-2" />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" className="bg-black p-2 text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
