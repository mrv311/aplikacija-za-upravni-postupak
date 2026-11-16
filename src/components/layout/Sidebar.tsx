'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Archive,
  BarChart3,
  BookOpen,
  Scale,
  Calculator,
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

  const primaryNavItems = [
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
      href: '/izvjestaji',
      label: 'Izvještaji i analitika',
      icon: BarChart3,
      exact: false,
    },
  ];

  const legalToolsNavItems = [
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
    {
      href: '/kalkulatori',
      label: 'Kalkulatori i Akti',
      icon: Calculator,
      exact: false,
    },
  ];

  const renderNavLink = (item: (typeof primaryNavItems)[0]) => {
    const Icon = item.icon;
    const isActive = item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        title={isCollapsed ? item.label : undefined}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
          isCollapsed ? 'justify-center px-0' : ''
        } ${
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400/30'
            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 transition-colors ${
            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
          }`}
        />
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

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
        } ${isCollapsed ? 'lg:w-[76px]' : 'lg:w-64'} w-64`}
      >
        {/* Zaglavlje sidebara s čistim institucionalnim amblemom */}
        <div className="px-3 py-3.5 border-b border-slate-800/80 dark:border-slate-800/60 flex items-center justify-between gap-1.5 min-h-[72px]">
          <Link
            href="/"
            className={`group flex items-center gap-2.5 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 ring-1 ring-inset ring-white/20 shadow-md shadow-blue-950/60 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
              <Scale className="w-[18px] h-[18px] text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-white tracking-tight leading-tight whitespace-nowrap">
                Upravni postupak
              </h2>
              <p className="text-[11px] font-medium text-slate-400 leading-tight mt-0.5 whitespace-nowrap">
                Drugostupanjsko rješavanje
              </p>
            </div>
          </Link>

          {/* Gumb za skupljanje/širenje sidebara (Desktop) */}
          <button
            type="button"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Proširi izbornik' : 'Skupi izbornik'}
            className={`hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ${
              isCollapsed ? 'mx-auto' : ''
            }`}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigacijski linkovi podijeljeni u logičke cjeline */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-slate-400/90 uppercase">
                Evidencija i rješavanje
              </div>
            )}
            {primaryNavItems.map(renderNavLink)}
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-800/70">
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-slate-400/90 uppercase">
                Pravni izvori i alati
              </div>
            )}
            {legalToolsNavItems.map(renderNavLink)}
          </div>
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
