'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Archive,
  BookOpen,
  Scale,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export function Sidebar() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sidebar_collapsed');
      if (stored !== null) {
        setIsCollapsed(stored === 'true');
      }
    } catch {}
    setMounted(true);
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Zatvori mobilni izbornik pri promjeni rute
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
    <>
      {/* Mobilni plutajući gumb (samo na malim ekranima) */}
      <div className="lg:hidden fixed top-3 left-3 z-40">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2.5 rounded-xl bg-slate-900 text-white shadow-lg border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Izbornik"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Pozadinski overlay za mobilni meni */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 transition-opacity"
        />
      )}

      {/* Glavna bočna traka */}
      <aside
        className={`fixed lg:static top-0 left-0 h-screen z-40 bg-slate-900 dark:bg-slate-950 text-slate-200 border-r border-slate-800/80 dark:border-slate-800/60 flex flex-col shadow-xl shrink-0 transition-all duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-64'} w-64`}
      >
        {/* Zaglavlje sidebara */}
        <div className="p-4 border-b border-slate-800/80 dark:border-slate-800/60 flex items-center justify-between min-h-[69px]">
          <div className={`flex items-center gap-2.5 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight truncate leading-tight">
                Upravni Postupak
              </h2>
              <p className="text-[11px] text-slate-400 truncate">Drugostupanjsko rješavanje</p>
            </div>
          </div>

          {/* Gumb za skupljanje/širenje sidebara (Desktop) */}
          <button
            type="button"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Proširi izbornik' : 'Skupi izbornik'}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer mx-auto"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigacijski linkovi */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {!isCollapsed && (
            <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Predmeti
            </div>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  isCollapsed ? 'justify-center px-0' : ''
                } ${
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
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Donji dio: AI Savjetnik i Dark mode prekidač */}
        <div className="p-3 border-t border-slate-800/80 dark:border-slate-800/60 space-y-2.5">
          {/* AI Savjetnik prečac */}
          <Link
            href="/savjetnik"
            title={isCollapsed ? 'AI Savjetnik' : undefined}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl transition-all font-semibold text-sm shadow-md ${
              isCollapsed ? 'px-0' : 'px-3'
            } ${
              pathname === '/savjetnik'
                ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-400/30'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/20'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">AI Savjetnik</span>}
          </Link>

          {/* Prekidač za tamnu temu */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Prebaci na svijetlu temu' : 'Prebaci na tamnu temu'}
            className={`flex items-center gap-2.5 w-full py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isCollapsed ? 'justify-center px-0' : ''
            } text-slate-400 hover:text-white hover:bg-slate-800/80`}
          >
            {isDark ? (
              <>
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                {!isCollapsed && <span>Svijetla tema</span>}
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-blue-300 shrink-0" />
                {!isCollapsed && <span>Tamna tema</span>}
              </>
            )}
          </button>

          {!isCollapsed && (
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-center pt-1 truncate">
              © 2026 Sustav za upravne predmete
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
