import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'carousel-desk',
  description: 'Automação de carrosséis de tecnologia para Instagram',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
