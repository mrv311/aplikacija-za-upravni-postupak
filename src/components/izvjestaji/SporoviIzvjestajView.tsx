'use client';

import React, { useState, useMemo } from 'react';
import {
  Scale,
  Calendar,
  Building2,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  Clock,
  TrendingUp,
  User,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  FileText,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  X,
  Download,
} from 'lucide-react';
import type { UpravniSpor } from '@/lib/upravni-sporovi';
import {
  type SporoviReportFilters,
  filterSporovi,
  calculateSporoviReportMetrics,
  exportSporoviReportToCsv,
} from '@/lib/report-sporovi-utils';
import { generateAiSporoviNarrativeAction } from '@/app/actions/reportActions';

interface SporoviIzvjestajViewProps {
  initialSporovi: UpravniSpor[];
}

export default function SporoviIzvjestajView({ initialSporovi }: SporoviIzvjestajViewProps) {
  // Filteri
  const [razdoblje, setRazdoblje] = useState<SporoviReportFilters['razdoblje']>('sve');
  const [datumOd, setDatumOd] = useState('');
  const [datumDo, setDatumDo] = useState('');
  const [sud, setSud] = useState('Svi');
  const [status, setStatus] = useState('Svi');
  const [vrsta, setVrsta] = useState('Sve');
  const [troskoviFilter, setTroskoviFilter] = useState('Sve');
  const [rjesavatelj, setRjesavatelj] = useState('Svi');
  const [searchQuery, setSearchQuery] = useState('');

  // AI narativno izvješće i izvozi
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiNarrative, setAiNarrative] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedAi, setCopiedAi] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // Dinamičko pronalaženje svih rješavatelja u podacima
  const availableRjesavatelji = useMemo(() => {
    const set = new Set<string>();
    for (const s of initialSporovi) {
      if (s.rjesavatelj && s.rjesavatelj.trim() !== '-') {
        set.add(s.rjesavatelj.trim());
      }
    }
    return Array.from(set).sort();
  }, [initialSporovi]);

  // Aktivni filteri
  const filters: SporoviReportFilters = useMemo(
    () => ({
      razdoblje,
      datumOd: datumOd || undefined,
      datumDo: datumDo || undefined,
      sud,
      status,
      vrsta,
      troskoviFilter,
      rjesavatelj,
      searchQuery,
    }),
    [razdoblje, datumOd, datumDo, sud, status, vrsta, troskoviFilter, rjesavatelj, searchQuery]
  );

  // Filtrirani sporovi i metrike
  const filteredSporovi = useMemo(() => filterSporovi(initialSporovi, filters), [initialSporovi, filters]);
  const metrics = useMemo(() => calculateSporoviReportMetrics(filteredSporovi), [filteredSporovi]);

  // Prikaz naziva razdoblja
  const periodLabel = useMemo(() => {
    if (razdoblje === 'sve') return 'Sve godine (ukupno)';
    if (razdoblje === 'custom') {
      if (datumOd && datumDo) return `Od ${datumOd} do ${datumDo}`;
      if (datumOd) return `Od ${datumOd}`;
      if (datumDo) return `Do ${datumDo}`;
      return 'Prilagođeno razdoblje';
    }
    return `${razdoblje}. godina`;
  }, [razdoblje, datumOd, datumDo]);

  // Generiranje AI narativnog sažetka za kolegij / ministra
  const handleGenerateAiNarrative = async () => {
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const sampleItems = filteredSporovi.slice(0, 15).map((s) => ({
        poslBroj: s.poslovniBroj || '-',
        sud: s.sud || '-',
        tuzitelj: s.tuzitelj || '-',
        vrsta: s.isSutnjaUprave ? 'Šutnja uprave' : 'Redovni spor',
        ishod: s.presudaTroskovi || (s.isPresudeno ? 'Presuđeno' : 'U tijeku'),
        troskovi: s.troskoviInfo?.iznos || s.presudaTroskovi || '0,00 €',
      }));

      const res = await generateAiSporoviNarrativeAction({
        periodLabel,
        metrics,
        sampleSporovi: sampleItems,
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

  // Izvoz u službeni Word (.docx)
  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const payload = {
        periodLabel,
        metrics,
        sporovi: filteredSporovi,
        aiNarrative,
      };

      const res = await fetch('/api/sporovi/export-report-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Greška pri generiranju Word dokumenta (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      const safePeriod = periodLabel.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
      a.download = `Izvjesce_upravni_sporovi_${safePeriod}_${dateStr}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'Neuspjelo preuzimanje Word izvješća.');
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Izvoz u CSV (Excel)
  const handleExportCsv = () => {
    const csv = exportSporoviReportToCsv(filteredSporovi, metrics);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Izvjesce_upravni_sporovi_${razdoblje}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatEur = (val: number) => {
    return val.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* SLUŽBENI MEMORANDUM ZA ISPIS (Vidljivo samo na window.print)  */}
      {/* ============================================================ */}
      <div className="hidden print:block mb-8 text-center border-b pb-6 text-slate-900">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-slate-600">
          Republika Hrvatska • Ministarstvo
        </h2>
        <h1 className="text-xl font-bold mt-1">
          SLUŽBENO IZVJEŠĆE O STANJU UPRAVNIH SPOROVA I SUDSKIM TROŠKOVIMA
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Razdoblje: {razdoblje === 'sve' ? 'Sve godine (ukupno)' : `${razdoblje}. godina`} • Generirano:{' '}
          {new Date().toLocaleDateString('hr-HR')} u {new Date().toLocaleTimeString('hr-HR')}
        </p>
      </div>

      {/* ============================================================ */}
      {/* 1. KONTROLNA TRAKA I FILTERI                                 */}
      {/* ============================================================ */}
      <div className="print:hidden p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Filteri analize upravnih sporova
            </h3>
            <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
              Prikazano: {filteredSporovi.length} od {initialSporovi.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateAiNarrative}
              disabled={isGeneratingAi || filteredSporovi.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
              title="Sastavi analitički narativni sažetak za ministra i kolegij pomoću AI savjetnika"
            >
              {isGeneratingAi ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI analizira sporove...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                  <span>AI Narativni sažetak</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportDocx}
              disabled={isExportingDocx || filteredSporovi.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              title="Preuzmi službeno izvješće s memorandumom Ministarstva u Word (.docx) formatu"
            >
              {isExportingDocx ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Priprema Word...</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Službeni Word (.docx)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
              title="Preuzmi filtrirani popis u Excel CSV formatu"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Izvoz u Excel (CSV)</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
              title="Ispiši ili spremi kao PDF dokument"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Ispiši / PDF</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Razdoblje / Godina */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-semibold">Razdoblje:</label>
            <select
              value={razdoblje}
              onChange={(e) => setRazdoblje(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="sve">Sve godine (ukupno)</option>
              <option value="2026">2026. godina</option>
              <option value="2025">2025. godina</option>
              <option value="2024">2024. godina</option>
              <option value="2023">2023. godina</option>
              <option value="custom">Prilagođeni datumski raspon</option>
            </select>
          </div>

          {/* Nadležni sud */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-semibold">Nadležni sud:</label>
            <select
              value={sud}
              onChange={(e) => setSud(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="Svi">Svi upravni sudovi</option>
              <option value="Zagreb">Upravni sud u Zagrebu</option>
              <option value="Split">Upravni sud u Splitu</option>
              <option value="Rijeka">Upravni sud u Rijeci</option>
              <option value="Osijek">Upravni sud u Osijeku</option>
              <option value="Visoki">Visoki upravni sud RH</option>
            </select>
          </div>

          {/* Status spora */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-semibold">Status spora:</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="Svi">Svi statusi</option>
              <option value="u_tijeku">U tijeku (otvoreni sporovi)</option>
              <option value="rijeseno">Riješeno (donesena presuda)</option>
              <option value="hitno">Hitni / istekli rokovi</option>
            </select>
          </div>

          {/* Vrsta spora */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-semibold">Vrsta spora:</label>
            <select
              value={vrsta}
              onChange={(e) => setVrsta(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="Sve">Sve vrste sporova</option>
              <option value="sutnja">Šutnja uprave (čl. 24. ZUS)</option>
              <option value="redovni">Redovni upravni sporovi</option>
            </select>
          </div>

          {/* Dosuđeni troškovi */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-semibold">Dosuđeni troškovi:</label>
            <select
              value={troskoviFilter}
              onChange={(e) => setTroskoviFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="Sve">Svi predmeti</option>
              <option value="s_troskovima">Samo s dosuđenim troškovima</option>
              <option value="neplaceno">🟡 Neplaćeno (čeka nalog)</option>
              <option value="placeno">🟢 Plaćeno (poslan nalog)</option>
            </select>
          </div>

          {/* Rješavatelj */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-semibold">Rješavatelj:</label>
            <select
              value={rjesavatelj}
              onChange={(e) => setRjesavatelj(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="Svi">Svi službenici</option>
              {availableRjesavatelji.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pretraga & Custom datumi */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Brzo pretraži po poslovnom broju (npr. Us I-184), tužitelju, OIB-u ili pobijanom aktu..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          {razdoblje === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={datumOd}
                onChange={(e) => setDatumOd(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={datumDo}
                onChange={(e) => setDatumDo(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          )}
        </div>
      </div>

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
                  Službeni nalaz i sažetak za kolegij Ministarstva (AI Savjetnik)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pripremljeno na temelju evidencije upravnih sporova za {periodLabel} • Uključeno u Word izvoz
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors cursor-pointer"
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
      {/* 2. GLAVNE KPI METRIKE (KARTICE NA VRHU)                       */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KARTICA 1: VOLUMEN SPOROVA */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-indigo-500" />
              Ukupno sporova
            </span>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              {metrics.stopaRijesenosti}% riješeno
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{metrics.ukupno}</span>
            <span className="text-xs font-semibold text-slate-500">
              {metrics.uTijeku} u radu • {metrics.rijeseno} riješeno
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-2xs flex justify-between text-slate-500">
            <span>Šutnja uprave: <strong>{metrics.sutnjaUprave}</strong></span>
            <span>Redovni: <strong>{metrics.redovniSporovi}</strong></span>
          </div>
        </div>

        {/* KARTICA 2: STOPA USPJEŠNOSTI MINISTARSTVA */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Uspješnost Ministarstva
            </span>
            <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
              {metrics.ishodi.stopaUspjehaMinistarstva}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {metrics.ishodi.odbijeno + metrics.ishodi.obustavljeno}
            </span>
            <span className="text-xs text-slate-500">
              od {metrics.ishodi.odbijeno + metrics.ishodi.uvazeno + metrics.ishodi.obustavljeno} presuđenih
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-2xs flex justify-between text-slate-500">
            <span className="text-emerald-700 dark:text-emerald-300">Odbijeno: <strong>{metrics.ishodi.odbijeno}</strong></span>
            <span className="text-blue-700 dark:text-blue-300">Obustavljeno: <strong>{metrics.ishodi.obustavljeno}</strong></span>
            <span className="text-rose-600 dark:text-rose-400">Poništeno: <strong>{metrics.ishodi.uvazeno}</strong></span>
          </div>
        </div>

        {/* KARTICA 3: FINANCIJE I TROŠKOVI SPORA */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>💰</span>
              Dosuđeni troškovi spora
            </span>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
              {metrics.financije.brojPredmetaSTroskovima} predmeta
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {formatEur(metrics.financije.ukupnoDosudenoEur)}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-2xs flex justify-between">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              Plaćeno: {formatEur(metrics.financije.placenoEur)} ({metrics.financije.brojPlacenih})
            </span>
            <span className="text-rose-600 dark:text-rose-400 font-bold">
              Neplaćeno: {formatEur(metrics.financije.neplacenoEur)} ({metrics.financije.brojNeplacenih})
            </span>
          </div>
        </div>

        {/* KARTICA 4: ODGOVORI NA TUŽBU & ROKOVI */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Ažurnost odgovora na tužbu
            </span>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {metrics.stopaOdgovoreno}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">{metrics.odgovoreno}</span>
            <span className="text-xs text-slate-500">odgovorenih tužbi</span>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-2xs flex justify-between text-slate-500">
            <span>Čeka odgovor: <strong>{metrics.ukupno - metrics.odgovoreno}</strong></span>
            <span>Uredno u roku: <strong>{metrics.stopaOdgovoreno}%</strong></span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. RADAR PARICIJSKIH ROKOVA & NEPLAĆENIH TROŠKOVA (HITNO)     */}
      {/* ============================================================ */}
      {metrics.financije.hitniRokovi.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                  Upozorenje na paricijske rokove za troškove spora ({metrics.financije.hitniRokovi.length} predmeta)
                </h4>
                <p className="text-2xs text-amber-700 dark:text-amber-300">
                  Predmeti u kojima su dosuđeni troškovi protiv Ministarstva, a još nije evidentirano slanje naloga računovodstvu:
                </p>
              </div>
            </div>
            <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100">
              Ukupno za platiti: {formatEur(metrics.financije.neplacenoEur)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {metrics.financije.hitniRokovi.map(({ spor, iznosEur, iznosFormat, danaDoRoka, rokDatumStr }) => (
              <div
                key={spor.id}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-2xs text-xs space-y-1"
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-900 dark:text-slate-100">{spor.poslovniBroj || 'Bez broja'}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-mono">{iznosFormat}</span>
                </div>
                <p className="text-2xs text-slate-600 dark:text-slate-400 truncate">{spor.tuzitelj}</p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-2xs">
                  <span className="text-slate-400">Rok: {rokDatumStr}</span>
                  {danaDoRoka !== null && (
                    <span
                      className={`font-bold ${
                        danaDoRoka < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : danaDoRoka <= 3
                          ? 'text-rose-600 font-extrabold animate-pulse'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {danaDoRoka < 0
                        ? `Isteklo prije ${Math.abs(danaDoRoka)} d!`
                        : danaDoRoka === 0
                        ? 'Istječe danas!'
                        : `Još ${danaDoRoka} dana`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. ANALITIČKA RAZDIOBA PO SUDOVIMA I ISHODIMA                */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* STATISTIKA PO NADLEŽNIM UPRAVNIM SUDOVIMA */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-500" />
              <span>Razdioba po upravnim sudovima</span>
            </h4>
            <span className="text-2xs text-slate-400">Broj predmeta i troškovi</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-2xs uppercase">
                  <th className="py-2 font-bold">Nadležni sud</th>
                  <th className="py-2 text-center font-bold">Ukupno</th>
                  <th className="py-2 text-center font-bold">U radu</th>
                  <th className="py-2 text-center font-bold">Riješeno</th>
                  <th className="py-2 text-center font-bold">Uspjeh %</th>
                  <th className="py-2 text-right font-bold">Dosuđeno €</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {metrics.sudovi.map((s) => (
                  <tr key={s.sud} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-semibold text-slate-900 dark:text-slate-100">{s.sud}</td>
                    <td className="py-2.5 text-center font-bold">{s.ukupno}</td>
                    <td className="py-2.5 text-center text-slate-500">{s.uTijeku}</td>
                    <td className="py-2.5 text-center text-slate-500">{s.rijeseno}</td>
                    <td className="py-2.5 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                      {s.rijeseno > 0 ? `${s.stopaUspjeha}%` : '-'}
                    </td>
                    <td className="py-2.5 text-right font-mono font-medium">
                      {s.ukupnoTroskovaEur > 0 ? formatEur(s.ukupnoTroskovaEur) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* STRUKTURA PREMA VRSTI PREDMETA I RJEŠAVATELJIMA */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              <span>Pravna područja i rješavatelji</span>
            </h4>
          </div>

          <div className="space-y-3">
            <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Top područja spora:</p>
            <div className="space-y-2">
              {metrics.predmetiPodrucja.slice(0, 5).map((p) => {
                const pct = metrics.ukupno > 0 ? Math.round((p.ukupno / metrics.ukupno) * 100) : 0;
                return (
                  <div key={p.predmet} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{p.predmet}</span>
                      <span className="text-2xs text-slate-500">
                        {p.ukupno} sporova ({pct}%) • {p.rijeseno} riješeno
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">Zaduženje službenika:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {metrics.rjesavatelji.slice(0, 4).map((r) => (
                  <div
                    key={r.rjesavatelj}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-0.5"
                  >
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{r.rjesavatelj}</p>
                    <p className="text-2xs text-slate-500">
                      Zaduženo: <strong>{r.ukupno}</strong> | Riješeno: <strong>{r.rijeseno}</strong>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. TABLIČNI PREGLED FILTRIRANIH SPOROVA                      */}
      {/* ============================================================ */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" />
            <span>Evidencija filtriranih upravnih sporova ({filteredSporovi.length})</span>
          </h4>
          <span className="text-2xs text-slate-400">Podaci usklađeni sa službenom evidencijom</span>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-2xs uppercase z-10 shadow-2xs">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="py-2.5 px-3">Rbr</th>
                <th className="py-2.5 px-3">Broj spora & Sud</th>
                <th className="py-2.5 px-3">Tužitelj</th>
                <th className="py-2.5 px-3">Predmet</th>
                <th className="py-2.5 px-3">Odgovor na tužbu</th>
                <th className="py-2.5 px-3">Presuda / Ishod</th>
                <th className="py-2.5 px-3 text-right">Dosuđeni troškovi</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredSporovi.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Nema sporova koji odgovaraju odabranim parametrima filtriranja.
                  </td>
                </tr>
              ) : (
                filteredSporovi.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 text-slate-400 font-mono text-2xs">{idx + 1}.</td>
                    <td className="py-2 px-3">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{s.poslovniBroj || '-'}</p>
                      <p className="text-2xs text-slate-400">{s.sud}</p>
                    </td>
                    <td className="py-2 px-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs">{s.tuzitelj}</p>
                      {s.oib && <p className="text-2xs font-mono text-slate-400">OIB: {s.oib}</p>}
                    </td>
                    <td className="py-2 px-3 text-2xs text-slate-600 dark:text-slate-400">
                      {s.predmet || '-'}
                    </td>
                    <td className="py-2 px-3 text-2xs">
                      {s.odgovorNaTuzbu ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{s.odgovorNaTuzbu}</span>
                      ) : (
                        <span className="text-slate-400 italic">Nije poslano</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-2xs">
                      {s.presudaTroskovi ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{s.presudaTroskovi}</span>
                      ) : (
                        <span className="text-slate-400">U tijeku</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-xs">
                      {s.troskoviInfo?.iznos ? (
                        <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {s.troskoviInfo.iznos}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-2xs">-</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {s.troskoviInfo?.status === 'poslan_nalog' ||
                      s.troskoviInfo?.status === 'placeno' ||
                      s.troskoviInfo?.bojaOznake === 'smedje' ? (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Plaćeno
                        </span>
                      ) : s.troskoviInfo?.status === 'neplaceno' ? (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Čeka nalog
                        </span>
                      ) : s.isPresudeno ? (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          Presuđeno
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          U radu
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* POTPISNI BLOK ZA SLUŽBENI ISPIS (Samo na window.print)        */}
      {/* ============================================================ */}
      <div className="hidden print:flex justify-between items-end pt-16 text-xs text-slate-800">
        <div>
          <p>U Zagrebu, {new Date().toLocaleDateString('hr-HR')}</p>
          <p className="text-[10px] text-slate-500">Služba za zastupanje u upravnim sporovima</p>
        </div>
        <div className="text-center">
          <div className="w-48 border-b border-slate-900 mb-1" />
          <p className="font-semibold">Viši upravni savjetnik</p>
        </div>
      </div>
    </div>
  );
}
