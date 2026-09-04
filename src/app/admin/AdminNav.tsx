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
    <nav className="flex items-center gap-6 border-b border-carvao/10 bg-carvao px-5 py-3">
      <span className="brand-caps font-heading text-lg font-extrabold text-creme">
        carousel<span className="text-laranja">.</span>desk
      </span>
      <div className="flex gap-5">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-creme/70 transition hover:text-creme"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
