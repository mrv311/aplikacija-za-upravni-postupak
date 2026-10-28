'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
  FolderCheck,
  Scale,
  Copy,
  Check,
  ChevronRight,
  RefreshCw,
  Layers,
  X,
} from 'lucide-react';
import type { EnrichedPredmet } from '@/lib/predmet-meta';
import {
  type ReportFilters,
  type ReportPeriodPreset,
  filterPredmeti,
  calculateReportMetrics,
  exportReportToCsv,
  getPredmetDurationInfo,
  getDateRangeForPreset,
} from '@/lib/report-utils';
import { generateAiReportNarrativeAction } from '@/app/actions/reportActions';

interface Props {
  initialPredmeti: EnrichedPredmet[];
}

export default function IzvjestajiView({ initialPredmeti }: Props) {
  // Stanje filtera
  const [period, setPeriod] = useState<ReportPeriodPreset>('ova-godina');
  const [customOd, setCustomOd] = useState('');
  const [customDo, setCustomDo] = useState('');
  const [podrucje, setPodrucje] = useState<string>('Sva');
  const [status, setStatus] = useState<string>('Svi');
  const [ishod, setIshod] = useState<string>('Svi');
  const [searchQuery, setSearchQuery] = useState('');

  // AI narativno izvješće stanje
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiNarrative, setAiNarrative] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedAi, setCopiedAi] = useState(false);

  // Dinamičko pronalaženje svih postojećih područja u podacima (tako da automatski podržava i sve buduće postupke)
  const availablePodrucja = useMemo(() => {
    const set = new Set<string>(['NUV', 'VD', 'NZZV', 'Ostalo']);
    for (const p of initialPredmeti) {
      if (p.podrucje) set.add(p.podrucje);
    }
    return Array.from(set);
  }, [initialPredmeti]);

  const filters: ReportFilters = useMemo(
    () => ({
      period,
      customOd: customOd || undefined,
      customDo: customDo || undefined,
      podrucje,
      status,
      ishod,
      query: searchQuery,
    }),
    [period, customOd, customDo, podrucje, status, ishod, searchQuery]
  );

  const filteredPredmeti = useMemo(
    () => filterPredmeti(initialPredmeti, filters),
    [initialPredmeti, filters]
  );

  const metrics = useMemo(
    () => calculateReportMetrics(filteredPredmeti),
    [filteredPredmeti]
  );

  const dateRangeLabel = useMemo(
    () => getDateRangeForPreset(period, customOd, customDo).label,
    [period, customOd, customDo]
  );

  // Rukovanje izvozom u Excel (CSV)
  const handleExportCsv = () => {
    const filename = `Izvjesce_upravni_postupak_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    exportReportToCsv(filteredPredmeti, filename);
  };

  // Rukovanje ispisom / PDF
  const handlePrint = () => {
    window.print();
  };

  // Generiranje AI narativnog sažetka
  const handleGenerateAiNarrative = async () => {
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const sampleItems = filteredPredmeti.slice(0, 20).map((p) => {
        const d = getPredmetDurationInfo(p);
        return {
          klasa: p.klasa,
          stranka: p.stranka,
          podrucje: p.podrucje || 'Ostalo',
          ishod: p.ishod,
          days: d.days,
          isOverdue: d.isOverdue,
        };
      });

      const res = await generateAiReportNarrativeAction({
        periodLabel: dateRangeLabel,
        metrics,
        sampleItems,
      });

      if (res.success && res.narrative) {
        setAiNarrative(res.narrative);
      } else {
        setAiError(res.error || 'Neuspjelo generiranje narativnog izvješća.');
      }
    } catch (err: any) {
      setAiError(err?.message || 'Greška u komunikaciji s AI poslužiteljem.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleCopyAiNarrative = () => {
    if (!aiNarrative) return;
    navigator.clipboard.writeText(aiNarrative);
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2000);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
      {/* ============================================================ */}
      {/* SLUŽBENI MEMORANDUM ZA ISPIS (Vidljivo samo na window.print)  */}
      {/* ============================================================ */}
      <div className="hidden print:block mb-8 text-center border-b pb-6 text-slate-900">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-slate-600">
          Republika Hrvatska • Ministarstvo
        </h2>
        <h1 className="text-xl font-bold mt-1">
          SLUŽBENO IZVJEŠĆE O RADU NA DRUGOSTUPANJSKIM UPRAVNIM PREDMETIMA
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Promatrano razdoblje: {dateRangeLabel} • Generirano:{' '}
          {new Date().toLocaleDateString('hr-HR')} u {new Date().toLocaleTimeString('hr-HR')}
        </p>
      </div>

      {/* ============================================================ */}
      {/* STANDARDNO ZAGLAVLJE EKRANA (Skriveno na ispisu)               */}
      {/* ============================================================ */}
      <header className="print:hidden flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              Izvještaji i analitika
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                Faza 2
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Analiza efikasnosti rješavanja, poštivanje ZUP rokova (60 dana), struktura odluka i službeni izvozi
            </p>
          </div>
        </div>

        {/* Akcijski gumbi */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleGenerateAiNarrative}
            disabled={isGeneratingAi || filteredPredmeti.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingAi ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                AI sastavlja sažetak...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-purple-200" />
                AI Narativni sažetak
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredPredmeti.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title="Preuzmi u formatu za Microsoft Excel s hrvatskim dijakritičkim znakovima"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Izvoz u Excel (CSV)
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition-colors cursor-pointer"
            title="Ispiši ili spremi kao službeni PDF dokument"
          >
            <Printer className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Ispiši / PDF
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* FILTER TRAKA (Period, Područje, Status, Ishod, Pretraga)      */}
      {/* ============================================================ */}
      <section className="print:hidden space-y-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Vremensko razdoblje:</span>
            <span className="text-slate-900 dark:text-slate-100 font-bold normal-case">
              {dateRangeLabel}
            </span>
          </div>

          {/* Brzi preset gumbi */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: 'ova-godina', label: 'Tekuća godina' },
                { id: 'prosla-godina', label: 'Prošla godina' },
                { id: 'kvartal', label: 'Zadnjih 90 d.' },
                { id: 'mjesec', label: 'Ovaj mjesec' },
                { id: 'sve', label: 'Sve vrijeme' },
                { id: 'custom', label: 'Prilagođeno' },
              ] as const
            ).map((p) => {
              const active = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Polja za prilagođeni datum ako je 'custom' odabran */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs">
            <span className="font-semibold text-blue-900 dark:text-blue-200">
              Odaberi datumski raspon:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-slate-600 dark:text-slate-400">Od:</label>
              <input
                type="date"
                value={customOd}
                onChange={(e) => setCustomOd(e.target.value)}
                className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-600 dark:text-slate-400">Do:</label>
              <input
                type="date"
                value={customDo}
                onChange={(e) => setCustomDo(e.target.value)}
                className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        )}

        {/* Filtri po kategorijama i tražilica */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Područje */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Upravno područje
            </label>
            <select
              value={podrucje}
              onChange={(e) => setPodrucje(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="Sva">Sva upravna područja</option>
              {availablePodrucja.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Status predmeta */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Status spisa
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="Svi">Svi statusi</option>
              <option value="arhiviran">Riješeni / Arhivirani (A/A)</option>
              <option value="aktivan">Aktivni u radu</option>
              <option value="na_potpisu">Samo na potpisu</option>
            </select>
          </div>

          {/* Ishod odluke */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ishod rješenja
            </label>
            <select
              value={ishod}
              onChange={(e) => setIshod(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="Svi">Svi ishodi</option>
              <option value="Odbijena žalba">Odbijena žalba (čl. 116. ZUP)</option>
              <option value="Poništeno rješenje">Poništeno rješenje (čl. 117. ZUP)</option>
              <option value="Odbačena žalba">Odbačena žalba (čl. 114. ZUP)</option>
              <option value="Obustava / Ostalo">Obustava / Ostalo</option>
            </select>
          </div>

          {/* Tražilica */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Brza pretraga
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Klasa, Urbroj, Žalitelj..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-medium pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* AI NARATIVNO IZVJEŠĆE KARTICA (Ako je generirano)             */}
      {/* ============================================================ */}
      {aiNarrative && (
        <section className="bg-gradient-to-br from-purple-50/70 via-indigo-50/40 to-white dark:from-purple-950/20 dark:via-indigo-950/10 dark:to-slate-900 p-6 rounded-2xl border border-purple-200/80 dark:border-purple-800/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-purple-200/60 dark:border-purple-800/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Službeni narativni sažetak za izvješće (AI Savjetnik)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pripremljeno na temelju službene statistike za {dateRangeLabel} • Spremno za
                  uvrštavanje u godišnje ili periodično izvješće
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAiNarrative}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-2xs transition-colors cursor-pointer"
              >
                {copiedAi ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Kopirano u međuspremnik!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Kopiraj tekst
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAiNarrative(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                title="Zatvori sažetak"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
            {aiNarrative}
          </div>
        </section>
      )}

      {aiError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* ============================================================ */}
      {/* GLAVNE STATISTIČKE KARTICE (Executive KPI Dashboard)           */}
      {/* ============================================================ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Ukupno zaprimljeno */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Ukupno predmeta
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {metrics.ukupnoPredmeta}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              U promatranom razdoblju
            </p>
          </div>
        </div>

        {/* 2. Riješeno i arhivirano */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Riješeno i arhivirano
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FolderCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {metrics.ukupnoRijeseno}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
                {metrics.stopaRjesavanja}%
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Udio dovršenih predmeta
            </p>
          </div>
        </div>

        {/* 3. U radu / Na potpisu */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Otvoreno u radu
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {metrics.ukupnoURadu}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {metrics.ukupnoNaPotpisu > 0
                ? `${metrics.ukupnoNaPotpisu} nacrt(a) na potpisu`
                : 'U fazi izrade i pripreme'}
            </p>
          </div>
        </div>

        {/* 4. Poštivanje ZUP roka (60 dana) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Rok ZUP (čl. 121.)
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                metrics.postotakURoku >= 90
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : metrics.postotakURoku >= 75
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-extrabold tracking-tight ${
                  metrics.postotakURoku >= 90
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : metrics.postotakURoku >= 75
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {metrics.postotakURoku}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">u roku</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {metrics.ukupnoPrekoracenRok > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  Prekoračeno: {metrics.ukupnoPrekoracenRok}
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Bez prekoračenja
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 5. Prosječno vrijeme rješavanja */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Prosječno trajanje
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {metrics.prosjecnoTrajanjeRjesavanjaDana || metrics.prosjecnoTrajanjeAktivnihDana || 0}
              </span>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                dana
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Od zaprimanja do rješenja
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* VIZUALNA ANALITIKA: ISHODI, PODRUČJA I DINAMIKA               */}
      {/* ============================================================ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Struktura odluka (Ishodi postupka) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Struktura odluka (Ishodi)
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {metrics.ukupnoRijeseno} riješenih
              </span>
            </div>

            {/* Vizualni progress bar udjela */}
            <div className="mt-4 h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              {metrics.ishodiBreakdown.map((item) => (
                <div
                  key={item.ishod}
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color,
                  }}
                  title={`${item.label}: ${item.count} (${item.percentage}%)`}
                  className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                />
              ))}
            </div>

            {/* Legenda i lista ishoda */}
            <div className="mt-5 space-y-2.5">
              {metrics.ishodiBreakdown.length > 0 ? (
                metrics.ishodiBreakdown.map((item) => (
                  <div
                    key={item.ishod}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {item.count}
                      </span>
                      <span className="text-slate-400 w-11 text-right">({item.percentage}%)</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">
                  Nema evidentiranih dovršenih rješenja u odabranom rasponu.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Usvojene žalbe (čl. 117.):</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {metrics.ishodiBreakdown.find((i) => i.ishod.includes('Poništeno'))?.percentage || 0}%
            </span>
          </div>
        </div>

        {/* 2. Raspodjela po upravnim područjima */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Upravna područja i postupci
                </h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {metrics.podrucjaBreakdown.length} kategorija
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {metrics.podrucjaBreakdown.map((item) => (
                <div key={item.podrucje} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.podrucje}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      <strong className="text-slate-900 dark:text-slate-100">{item.count}</strong>{' '}
                      ({item.percentage}%) • riješeno: {item.rijeseno}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            Automatski prepoznaje nove postupke dodane u evidenciju.
          </div>
        </div>

        {/* 3. Mjesečna dinamika rješavanja */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Mjesečna dinamika
                </h3>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-xs bg-blue-500 inline-block" /> Zapr.
                </span>
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-xs bg-emerald-500 inline-block" /> Riješeno
                </span>
              </div>
            </div>

            {/* Jednostavni stupčasti grafikon čistim Tailwindom */}
            <div className="mt-4 grid grid-cols-6 gap-2 pt-2">
              {metrics.mjesecniTrend.slice(-6).map((m) => {
                const maxVal = Math.max(
                  1,
                  ...metrics.mjesecniTrend.slice(-6).map((x) => Math.max(x.zaprimljeno, x.rijeseno))
                );
                const zaprHeight = Math.round((m.zaprimljeno / maxVal) * 56);
                const rijHeight = Math.round((m.rijeseno / maxVal) * 56);

                return (
                  <div key={m.key} className="flex flex-col items-center gap-1.5">
                    <div className="h-16 w-full flex items-end justify-center gap-1">
                      <div
                        style={{ height: `${Math.max(4, zaprHeight)}px` }}
                        className="w-2.5 bg-blue-500/80 rounded-t-xs hover:bg-blue-600 transition-colors"
                        title={`Zaprimljeno (${m.mjesecNaziv}): ${m.zaprimljeno}`}
                      />
                      <div
                        style={{ height: `${Math.max(4, rijHeight)}px` }}
                        className="w-2.5 bg-emerald-500/80 rounded-t-xs hover:bg-emerald-600 transition-colors"
                        title={`Riješeno (${m.mjesecNaziv}): ${m.rijeseno}`}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                      {m.mjesecNaziv}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Zadnjih 6 mjeseci</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Trend obrade i rješavanja
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* DETALJNA TABLICA PREDMETA (S mogućnošću filtriranja i sortiranja) */}
      {/* ============================================================ */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight">
              Popis predmeta u izvještajnom razdoblju
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Prikazano {filteredPredmeti.length} od ukupno {initialPredmeti.length} predmeta
            </p>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Klikom na klasu otvara se spis predmeta
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Klasa / Urbroj</th>
                <th className="py-3 px-4">Stranka / Žalitelj</th>
                <th className="py-3 px-4">Područje</th>
                <th className="py-3 px-4">Zaprimljeno</th>
                <th className="py-3 px-4">Riješeno / Potpis</th>
                <th className="py-3 px-4">Trajanje</th>
                <th className="py-3 px-4">ZUP rok (60 d.)</th>
                <th className="py-3 px-4">Ishod / Status</th>
                <th className="py-3 px-4 text-right print:hidden">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPredmeti.length > 0 ? (
                filteredPredmeti.map((p) => {
                  const duration = getPredmetDurationInfo(p);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <Link
                          href={`/predmeti/${p.id}`}
                          className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          {p.klasa || 'Bez klase'}
                        </Link>
                        <div className="text-[10px] text-slate-400 font-sans font-normal">
                          {p.urbroj || '—'}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                        {p.stranka || 'Nepoznata stranka'}
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {p.podrucje || 'Ostalo'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {p.datum_zaprimanja
                          ? new Date(p.datum_zaprimanja).toLocaleDateString('hr-HR')
                          : '—'}
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {p.datum_rjesavanja || p.datum_slanja_na_potpis
                          ? new Date(
                              (p.datum_rjesavanja || p.datum_slanja_na_potpis)!
                            ).toLocaleDateString('hr-HR')
                          : '—'}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {duration.days} dana
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            duration.isOverdue
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                          }`}
                        >
                          {duration.isOverdue ? (
                            <>
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Prekoračeno (+{duration.days - 60} d.)
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3 shrink-0" />U roku
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {p.ishod ? (
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                              p.ishod === 'Odbijena žalba'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : p.ishod === 'Poništeno rješenje'
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            {p.ishod}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {p.faza === 'Na potpisu' ? 'Na potpisu' : 'U radu'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right print:hidden">
                        <Link
                          href={`/predmeti/${p.id}`}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 font-semibold text-xs"
                        >
                          Otvori spis
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Nema predmeta koji odgovaraju odabranim filtrima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============================================================ */}
      {/* POTPISNI BLOK ZA SLUŽBENI ISPIS (Samo na window.print)        */}
      {/* ============================================================ */}
      <div className="hidden print:flex justify-between items-end pt-16 text-xs text-slate-800">
        <div>
          <p>U Zagrebu, {new Date().toLocaleDateString('hr-HR')}</p>
          <p className="text-[10px] text-slate-500">Služba za drugostupanjski upravni postupak</p>
        </div>
        <div className="text-center">
          <div className="w-48 border-b border-slate-900 mb-1" />
          <p className="font-semibold">Viši upravni savjetnik</p>
        </div>
      </div>
    </div>
  );
}
