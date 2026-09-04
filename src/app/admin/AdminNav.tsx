import type { JSX } from 'react';
import Link from 'next/link';

const LINKS = [
  { href: '/admin', label: 'Quadro' },
  { href: '/admin/strategy', label: 'Estratégia da marca' },
  { href: '/admin/lead-magnets', label: 'Lead magnets' },
  { href: '/admin/automations', label: 'Automações' },
];

export function AdminNav(): JSX.Element {
  return (
    <nav className="flex gap-4 border-b bg-white p-3 text-sm">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="text-neutral-700 hover:underline">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
