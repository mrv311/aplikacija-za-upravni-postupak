'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, Archive, BookOpen, Scale, Sparkles } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/',
      label: 'Aktivni predmeti',
      icon: Inbox,
      exact: true,
    },
    {
      href: '/arhiva',
      label: 'Arhiva (A/A)',
      icon: Archive,
      exact: false,
    },
    {
      href: '/baza-prakse',
      label: 'Baza prakse',
      icon: BookOpen,
      exact: false,
    },
    {
      href: '/propisi',
      label: 'Baza propisa',
      icon: Scale,
      exact: false,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 h-screen flex flex-col shadow-xl shrink-0">
      <div className="p-6 border-b border-slate-800/80">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
          Upravni Postupak
        </h2>
        <p className="text-xs text-slate-400 mt-1">Drugostupanjsko rješavanje</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Predmeti
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-medium ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-slate-400'
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 space-y-3">
        <Link
          href="/savjetnik"
          className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl transition-all font-semibold text-sm shadow-md ${
            pathname === '/savjetnik'
              ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-400/30'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/20'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI Savjetnik</span>
        </Link>

        <div className="text-[11px] text-slate-400 text-center">
          © 2026 Sustav za upravne predmete
        </div>
      </div>
    </aside>
  );
}
