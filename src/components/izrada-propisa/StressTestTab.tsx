'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Sparkles,
  Download,
  Copy,
  Check,
  Loader2,
  Cpu,
  BookOpen,
  Scale,
} from 'lucide-react';
import type {
  PropisDocument,
  PropisProject,
  StressTestAxis,
  StressTestFinding,
  StressTestReport,
  StressTestSeverity,
} from '@/lib/izrada-propisa-types';
import { runLocalStressChecks } from '@/lib/propis-stress-local';
import { runStressTestAction } from '@/app/actions/izradaPropisaPhase3Actions';

interface StressTestTabProps {
  project: PropisProject;
  documents: PropisDocument[];
  reports: StressTestReport[];
  onReportsChange: (reports: StressTestReport[]) => void;
}

const AXIS_META: Record<StressTestAxis, { label: string; short: string; color: string }> = {
  jmnp: {
    label: 'Nomotehnika (JMNP, NN 74/15 & UZZ)',
    short: 'JMNP / UZZ',
    color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  zakonitost: {
    label: 'Zakonitost i ovlasti (ZFVG / ZOV / ZUP)',
    short: 'ZFVG / ZOV',
    color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  },
  sudska_praksa: {
    label: 'Sudska i upravna praksa (Baza prakse)',
    short: 'Sudska praksa',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  },
  dosljednost: {
    label: 'Unutarnja i tarifna dosljednost',
    short: 'Dosljednost',
    color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
  },
};

export function StressTestTab({
  project,
  documents,
  reports,
  onReportsChange,
}: StressTestTabProps) {
  const draftDocs = useMemo(
    () =>
      documents.filter(
        (d) => d.uloga === 'aktualni_nacrt' || d.uloga === 'prethodna_verzija'
      ),
    [documents]
  );
  const excelDocs = useMemo(
    () => documents.filter((d) => d.uloga === 'excel_tarife'),
    [documents]
  );

  const [selectedDraftId, setSelectedDraftId] = useState<string>(
    () =>
      draftDocs.find((d) => d.uloga === 'aktualni_nacrt')?.id || draftDocs[0]?.id || ''
  );
  const [modelPref, setModelPref] = useState<'pro' | 'flash'>('pro');
  const [runningAi, setRunningAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [axisFilter, setAxisFilter] = useState<'sve' | StressTestAxis>('sve');
  const [sevFilter, setSevFilter] = useState<'sve' | StressTestSeverity>('sve');
  const [selectedReportId, setSelectedReportId] = useState<string>(reports[0]?.id || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const activeDraft =
    draftDocs.find((d) => d.id === selectedDraftId) ||
    draftDocs.find((d) => d.uloga === 'aktualni_nacrt') ||
    draftDocs[0];

  // Sloj 1: Trenutni lokalni JMNP skener (0 AI troška)
  const liveLocalFindings = useMemo(() => {
    if (!activeDraft) return [];
    return runLocalStressChecks(activeDraft, excelDocs);
  }, [activeDraft, excelDocs]);

  const activeReport =
    reports.find((r) => r.id === selectedReportId) || reports[0] || null;

  const combinedFindings: StressTestFinding[] = useMemo(() => {
    const list = activeReport
      ? [...activeReport.localFindings, ...activeReport.aiFindings]
      : liveLocalFindings;

    const sevRank: Record<StressTestSeverity, number> = {
      kriticno: 0,
      upozorenje: 1,
      preporuka: 2,
      ok: 3,
    };

    return list
      .filter((f) => {
        if (axisFilter !== 'sve' && f.axis !== axisFilter) return false;
        if (sevFilter !== 'sve' && f.severity !== sevFilter) return false;
        return true;
      })
      .sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  }, [activeReport, liveLocalFindings, axisFilter, sevFilter]);

  const counts = useMemo(() => {
    const all = activeReport
      ? [...activeReport.localFindings, ...activeReport.aiFindings]
      : liveLocalFindings;
    return {
      kriticno: all.filter((f) => f.severity === 'kriticno').length,
      upozorenje: all.filter((f) => f.severity === 'upozorenje').length,
      preporuka: all.filter((f) => f.severity === 'preporuka').length,
      ukupno: all.length,
    };
  }, [activeReport, liveLocalFindings]);

  const handleRunDeepStressTest = async () => {
    if (!activeDraft) return;
    setRunningAi(true);
    setError(null);
    const res = await runStressTestAction({
      projectId: project.id,
      draftDocId: activeDraft.id,
      modelPreference: modelPref,
    });
    setRunningAi(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.reports && res.report) {
      onReportsChange(res.reports);
      setSelectedReportId(res.report.id);
    }
  };

  const handleCopySuggestion = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const handleExportDocx = async () => {
    const reportToExport: StressTestReport = activeReport || {
      id: 'local-only',
      createdAt: new Date().toISOString(),
      draftDocId: activeDraft?.id || '',
      draftDocName: activeDraft?.prikazniNaziv || project.naziv,
      modelName: 'Lokalni JMNP skener',
      ukupnaOcjena: counts.kriticno > 0 ? 'Potrebne bitne dorade' : 'Potrebne manje dorade',
      sazetak: 'Automatska lokalna JMNP i dosljednosna provjera nacrta propisa (Sloj 1).',
      localFindings: liveLocalFindings,
      aiFindings: [],
      referencedPraksaTitles: [],
      referencedZakoni: [],
    };

    setExporting(true);
    try {
      const res = await fetch('/api/izrada-propisa/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'stress_test',
          projectName: project.naziv,
          puniNazivAkta: project.puniNazivAkta,
          report: reportToExport,
        }),
      });
      if (!res.ok) throw new Error('Greška pri izvozu.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stress_test_${project.naziv.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const severityCardStyle = (sev: StressTestSeverity) => {
    if (sev === 'kriticno')
      return 'border-l-4 border-l-rose-600 bg-rose-50/30 dark:bg-rose-950/20';
    if (sev === 'upozorenje')
      return 'border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/20';
    return 'border-l-4 border-l-blue-500 bg-white dark:bg-slate-900';
  };

  return (
    <div className="space-y-4">
      {/* Kontrolni panel Stress-testa */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Pravni i nomotehnički Stress-test (JMNP + ZFVG/ZOV + Sudska praksa)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sloj 1 trenutno provjerava zagrade, numeraciju, upućivanja, NN citate i tarife (0 AI). Sloj 2 provodi dubinsku pravnu reviziju kroz Bazu zakona i Bazu prakse.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={activeDraft?.id || ''}
              onChange={(e) => setSelectedDraftId(e.target.value)}
              className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 max-w-60"
            >
              {draftDocs.length === 0 ? (
                <option value="">(Nema učitanog nacrta)</option>
              ) : (
                draftDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.uloga === 'aktualni_nacrt' ? '★ ' : ''}
                    {d.prikazniNaziv}
                  </option>
                ))
              )}
            </select>

            <select
              value={modelPref}
              onChange={(e) => setModelPref(e.target.value as 'pro' | 'flash')}
              className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
            >
              <option value="pro">Gemini Pro (preporučeno)</option>
              <option value="flash">Gemini Flash (brzi)</option>
            </select>

            <button
              type="button"
              disabled={!activeDraft || runningAi}
              onClick={handleRunDeepStressTest}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {runningAi ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {runningAi ? 'Analiziram nacrt, zakone i praksu...' : 'Pokreni dubinski AI Stress-test'}
            </button>

            <button
              type="button"
              disabled={!activeDraft || exporting}
              onClick={handleExportDocx}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Izvješće .docx
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Zbirna ocjena i povijest izvješća */}
        {activeReport && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    activeReport.ukupnaOcjena === 'Spremno za UZZ'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      : activeReport.ukupnaOcjena === 'Potrebne manje dorade'
                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                  }`}
                >
                  {activeReport.ukupnaOcjena === 'Spremno za UZZ' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  Ocjena: {activeReport.ukupnaOcjena}
                </span>
                <span className="text-[11px] text-slate-500">
                  Nacrt: <strong>{activeReport.draftDocName}</strong> ·{' '}
                  {new Date(activeReport.createdAt).toLocaleString('hr-HR')}
                </span>
              </div>

              {reports.length > 1 && (
                <select
                  value={activeReport.id}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                  className="px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                >
                  {reports.map((r, i) => (
                    <option key={r.id} value={r.id}>
                      Revizija #{reports.length - i} ({new Date(r.createdAt).toLocaleDateString('hr-HR')})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {activeReport.sazetak}
            </p>

            {(activeReport.referencedPraksaTitles.length > 0 ||
              activeReport.referencedZakoni.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300">
                  <BookOpen className="w-3 h-3" />
                  Provjereno kroz {activeReport.referencedPraksaTitles.length} odluka Baze prakse
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-300">
                  <Scale className="w-3 h-3" />
                  {activeReport.referencedZakoni.length} članaka Baze zakona
                </span>
              </div>
            )}
          </div>
        )}

        {/* Semafor brojača i filtri */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSevFilter('sve')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                sevFilter === 'sve'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Svi nalazi ({counts.ukupno})
            </button>
            <button
              type="button"
              onClick={() => setSevFilter('kriticno')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                sevFilter === 'kriticno'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              Kritično ({counts.kriticno})
            </button>
            <button
              type="button"
              onClick={() => setSevFilter('upozorenje')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                sevFilter === 'upozorenje'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
            >
              Upozorenja ({counts.upozorenje})
            </button>
            <button
              type="button"
              onClick={() => setSevFilter('preporuka')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                sevFilter === 'preporuka'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              Preporuke ({counts.preporuka})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setAxisFilter('sve')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                axisFilter === 'sve'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Sve 4 osi
            </button>
            {(['jmnp', 'zakonitost', 'sudska_praksa', 'dosljednost'] as StressTestAxis[]).map(
              (ax) => (
                <button
                  key={ax}
                  type="button"
                  onClick={() => setAxisFilter(ax)}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    axisFilter === ax
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {AXIS_META[ax].short}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Lista nalaza */}
      {!activeDraft ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center text-sm text-slate-500">
          Učitajte Aktualni nacrt propisa u kartici „Dokumenti i Nacrt” za pokretanje Stress-testa.
        </div>
      ) : combinedFindings.length === 0 ? (
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-8 text-center text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          Nema nalaza za odabrani filtar. {!activeReport && 'Pokrenite dubinski AI Stress-test za analizu usklađenosti sa ZFVG/ZOV i sudskom praksom.'}
        </div>
      ) : (
        <div className="space-y-3">
          {combinedFindings.map((f) => (
            <div
              key={f.id}
              className={`rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 shadow-2xs ${severityCardStyle(
                f.severity
              )}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {f.severity === 'kriticno' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : f.severity === 'upozorenje' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {f.naslov}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded bg-slate-900/5 dark:bg-white/10 text-slate-800 dark:text-slate-200">
                    {f.clanak}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded border ${
                      AXIS_META[f.axis].color
                    }`}
                  >
                    {AXIS_META[f.axis].short}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500">
                    {f.source === 'lokalni' ? (
                      <>
                        <Cpu className="w-2.5 h-2.5 text-emerald-600" /> Lokalni skener
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-2.5 h-2.5 text-indigo-600" /> AI revizija
                      </>
                    )}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {f.opis}
              </p>

              {f.pravnaOsnovaIliPraksa && (
                <div className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/70 rounded-lg px-3 py-1.5">
                  <strong>Pravna osnova / praksa:</strong> {f.pravnaOsnovaIliPraksa}
                </div>
              )}

              {f.prijedlogPreformulacije && (
                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Prijedlog preformulacije / izmjene
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopySuggestion(f.id, f.prijedlogPreformulacije!)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                    >
                      {copiedId === f.id ? (
                        <>
                          <Check className="w-3 h-3" /> Kopirano
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Kopiraj
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {f.prijedlogPreformulacije}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
