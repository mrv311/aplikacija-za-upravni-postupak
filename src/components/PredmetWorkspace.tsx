'use client';

import React, { useState } from 'react';
import {
  Columns2,
  PanelLeft,
  PanelRight,
  Maximize2,
  FileText,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { calculateZupDeadline, type EnrichedPredmet } from '@/lib/predmet-meta';

type LayoutMode = 'balanced' | 'focus-docs' | 'focus-ai';

interface PredmetWorkspaceProps {
  predmet: EnrichedPredmet;
  childrenDocs: React.ReactNode;
  childrenAi: React.ReactNode;
}

export function PredmetWorkspace({
  predmet,
  childrenDocs,
  childrenAi,
}: PredmetWorkspaceProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('balanced');
  const [mobileTab, setMobileTab] = useState<'docs' | 'ai'>('docs');

  React.useEffect(() => {
    const handleSwitchToAi = () => setMobileTab('ai');
    window.addEventListener('switch-to-ai-tab', handleSwitchToAi);
    window.addEventListener('trigger-ai-review', handleSwitchToAi);
    return () => {
      window.removeEventListener('switch-to-ai-tab', handleSwitchToAi);
      window.removeEventListener('trigger-ai-review', handleSwitchToAi);
    };
  }, []);

  // Izračun roka i boje za ZUP bedž
  const deadline = calculateZupDeadline(predmet.datum_zaprimanja);
  const dani = deadline ? deadline.daysRemaining : null;
  const rokIstekao = deadline ? deadline.daysRemaining < 0 : false;
  const datumRokaPrikaz = deadline ? deadline.deadlineDateFormatted : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Gornja informativna traka: ZUP Rok i kontrola rasporeda */}
      <div className="px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Lijevo: Prikaz ZUP zakonskog roka */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {dani !== null && datumRokaPrikaz ? (
            rokIstekao ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>ZUP ROK ISTEKAO (rok bio {datumRokaPrikaz})</span>
              </span>
            ) : dani <= 15 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800 shadow-2xs animate-pulse">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>HITNO: Preostalo još {dani} dana (rok do {datumRokaPrikaz})</span>
              </span>
            ) : dani <= 30 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-50 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-900 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-yellow-600 shrink-0" />
                <span>Preostalo {dani} dana do roka (do {datumRokaPrikaz})</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Preostalo {dani} dana do roka (rok do {datumRokaPrikaz})</span>
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Datum zaprimanja nije definiran</span>
            </span>
          )}

          {/* Oznaka područja */}
          <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {predmet.podrucje}
          </span>
        </div>

        {/* Desno: Kontrola rasporeda radnog prostora (Desktop) */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
          <span className="px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Raspored:
          </span>

          <button
            type="button"
            onClick={() => setLayoutMode('focus-docs')}
            title="Fokus na spis (70% ekran za dokumente, 30% AI)"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              layoutMode === 'focus-docs'
                ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span>Spis 70%</span>
          </button>

          <button
            type="button"
            onClick={() => setLayoutMode('balanced')}
            title="Uravnoteženi prikaz (50% : 50%)"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              layoutMode === 'balanced'
                ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>50 : 50</span>
          </button>

          <button
            type="button"
            onClick={() => setLayoutMode('focus-ai')}
            title="Fokus na AI & Nacrt (30% dokumenti, 70% AI)"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              layoutMode === 'focus-ai'
                ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span>AI 70%</span>
          </button>
        </div>

        {/* Mobilni tab prekidač (ekrani < 1024px) */}
        <div className="flex lg:hidden w-full border-t border-slate-200 dark:border-slate-800 pt-2 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMobileTab('docs')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 border transition-all ${
              mobileTab === 'docs'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Dokumenti i skenovi ({predmet.broj_dokumenata})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('ai')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 border transition-all ${
              mobileTab === 'ai'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Savjetnik & Nacrt</span>
          </button>
        </div>
      </div>

      {/* Glavni radni prostor s podesivim stupcima */}
      <div className="flex-1 p-3 sm:p-4 overflow-hidden min-h-0">
        <div className="flex gap-4 h-full min-h-0">
          {/* LIJEVI STUPAC: Skenovi i dokumenti u spisu */}
          <section
            className={`min-w-0 bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-200 ${
              mobileTab !== 'docs' ? 'hidden lg:flex' : 'flex'
            } ${
              layoutMode === 'focus-docs'
                ? 'lg:flex-[7]'
                : layoutMode === 'focus-ai'
                ? 'lg:flex-[3]'
                : 'lg:flex-1'
            }`}
          >
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <h2 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 truncate">
                  Dokumenti i skenovi u spisu
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                {predmet.broj_dokumenata} dok.
              </span>
            </div>

            <div className="flex-1 p-3 sm:p-4 overflow-y-auto min-h-0">
              {childrenDocs}
            </div>
          </section>

          {/* DESNI STUPAC: AI Pravni savjetnik za ovaj spis */}
          <div
            className={`min-w-0 flex flex-col overflow-hidden transition-all duration-200 ${
              mobileTab !== 'ai' ? 'hidden lg:flex' : 'flex'
            } ${
              layoutMode === 'focus-ai'
                ? 'lg:flex-[7]'
                : layoutMode === 'focus-docs'
                ? 'lg:flex-[3]'
                : 'lg:flex-1'
            }`}
          >
            {childrenAi}
          </div>
        </div>
      </div>
    </div>
  );
}
