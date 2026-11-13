'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Pencil,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { calculateZupDeadline, type EnrichedPredmet } from '@/lib/predmet-meta';
import { updateDatumPredajeZalbeAction } from '@/app/actions/predmetActions';

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
  const router = useRouter();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('balanced');
  const [mobileTab, setMobileTab] = useState<'docs' | 'ai'>('docs');
  const [editingAppealDate, setEditingAppealDate] = useState(false);
  const [appealDateInput, setAppealDateInput] = useState(predmet.datum_predaje_zalbe || '');
  const [savingAppealDate, setSavingAppealDate] = useState(false);
  const [appealDateError, setAppealDateError] = useState<string | null>(null);

  React.useEffect(() => {
    const handleSwitchToAi = () => setMobileTab('ai');
    window.addEventListener('switch-to-ai-tab', handleSwitchToAi);
    window.addEventListener('trigger-ai-review', handleSwitchToAi);
    return () => {
      window.removeEventListener('switch-to-ai-tab', handleSwitchToAi);
      window.removeEventListener('trigger-ai-review', handleSwitchToAi);
    };
  }, []);

  const handleSaveAppealDate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingAppealDate(true);
    setAppealDateError(null);
    const trimmed = appealDateInput.trim();
    const res = await updateDatumPredajeZalbeAction(
      predmet.id,
      trimmed,
      trimmed ? 'ručno' : ''
    );
    setSavingAppealDate(false);
    if (res.error) {
      setAppealDateError(res.error);
      return;
    }
    setEditingAppealDate(false);
    router.refresh();
  };

  // Izračun zakonskog roka (60 dana od predaje žalbe, čl. 121. ZUP-a)
  const deadline = calculateZupDeadline(predmet.datum_predaje_zalbe);
  const dani = deadline ? deadline.daysRemaining : null;
  const rokIstekao = deadline ? deadline.daysRemaining < 0 : false;
  const datumRokaPrikaz = deadline ? deadline.deadlineDateFormatted : null;
  const appealDateFormatted =
    predmet.datum_predaje_zalbe && /^\d{4}-\d{2}-\d{2}$/.test(predmet.datum_predaje_zalbe)
      ? `${predmet.datum_predaje_zalbe.split('-').reverse().join('.')}.`
      : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Gornja informativna traka: ZUP Rok i kontrola rasporeda */}
      <div className="px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Lijevo: Prikaz ZUP zakonskog roka */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {editingAppealDate ? (
            <form
              onSubmit={handleSaveAppealDate}
              className="inline-flex items-center gap-1.5 flex-wrap bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <label
                htmlFor="inline-appeal-date"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Predaja žalbe:
              </label>
              <input
                id="inline-appeal-date"
                type="date"
                value={appealDateInput}
                onChange={(e) => setAppealDateInput(e.target.value)}
                disabled={savingAppealDate}
                className="px-2 py-0.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={savingAppealDate}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {savingAppealDate ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Spremi
              </button>
              <button
                type="button"
                disabled={savingAppealDate}
                onClick={() => {
                  setAppealDateInput(predmet.datum_predaje_zalbe || '');
                  setAppealDateError(null);
                  setEditingAppealDate(false);
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium cursor-pointer"
                title="Odustani"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {appealDateError && (
                <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  {appealDateError}
                </span>
              )}
            </form>
          ) : dani !== null && datumRokaPrikaz ? (
            <div className="inline-flex items-center gap-1.5 flex-wrap">
              {rokIstekao ? (
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
              )}
              {appealDateFormatted && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  od predaje žalbe {appealDateFormatted}
                  {predmet.datum_predaje_zalbe_izvor
                    ? ` (${predmet.datum_predaje_zalbe_izvor})`
                    : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setAppealDateInput(predmet.datum_predaje_zalbe || '');
                  setAppealDateError(null);
                  setEditingAppealDate(true);
                }}
                title="Uredi datum predaje žalbe"
                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 flex-wrap">
              <span
                title="Zakonski rok od 60 dana (čl. 121. ZUP-a) teče od dana predaje žalbe prvostupanjskom ili drugostupanjskom tijelu, ne od zaprimanja u Ministarstvu."
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>ZUP rok (60 d.): čeka datum predaje žalbe</span>
              </span>
              {predmet.status !== 'arhiviran' && (
                <button
                  type="button"
                  onClick={() => {
                    setAppealDateInput('');
                    setAppealDateError(null);
                    setEditingAppealDate(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  Unesi datum predaje žalbe
                </button>
              )}
            </div>
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
