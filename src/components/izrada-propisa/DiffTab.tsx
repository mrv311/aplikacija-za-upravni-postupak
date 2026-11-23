'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  GitCompareArrows,
  Download,
  Sparkles,
  Columns2,
  AlignLeft,
  Loader2,
  Scale,
  AlertTriangle,
} from 'lucide-react';
import type {
  ArticleDiffItem,
  PropisDocument,
  PropisProject,
} from '@/lib/izrada-propisa-types';
import { compareDraftVersions } from '@/lib/propis-diff';
import {
  getEnactedLawTextForDiffAction,
  generateDiffExplanationsAction,
} from '@/app/actions/izradaPropisaPrimjedbeActions';

interface DiffTabProps {
  project: PropisProject;
  documents: PropisDocument[];
}

const LAW_OPTION_PREFIX = '__BAZA_ZAKONA__:';

export function DiffTab({ project, documents }: DiffTabProps) {
  const draftDocs = useMemo(
    () =>
      documents
        .filter((d) => d.uloga === 'aktualni_nacrt' || d.uloga === 'prethodna_verzija')
        .sort((a, b) => {
          if (a.uloga === 'aktualni_nacrt' && b.uloga !== 'aktualni_nacrt') return -1;
          if (b.uloga === 'aktualni_nacrt' && a.uloga !== 'aktualni_nacrt') return 1;
          return (b.datumVerzije || b.createdAt).localeCompare(a.datumVerzije || a.createdAt);
        }),
    [documents]
  );

  const defaultEnactedLaw =
    project.maticniPropisi.find((m) => /uredba|pravilnik/i.test(m)) ||
    'Uredba o visini naknade za uređenje voda';

  const [sourceA, setSourceA] = useState<string>(() => {
    if (draftDocs.length >= 2) return draftDocs[1].id;
    return `${LAW_OPTION_PREFIX}${defaultEnactedLaw}`;
  });
  const [sourceB, setSourceB] = useState<string>(() => draftDocs[0]?.id || '');

  const [enactedCache, setEnactedCache] = useState<Record<string, { label: string; text: string }>>(
    {}
  );
  const [loadingLaw, setLoadingLaw] = useState(false);
  const [lawError, setLawError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'redline' | 'side-by-side'>('redline');
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [generatingAi, setGeneratingAi] = useState(false);
  const [exportingMode, setExportingMode] = useState<string | null>(null);

  // Automatski postavi nove verzije ako su naknadno učitane
  useEffect(() => {
    if (!sourceB && draftDocs[0]) setSourceB(draftDocs[0].id);
    if (!sourceA && draftDocs[1]) setSourceA(draftDocs[1].id);
  }, [draftDocs, sourceA, sourceB]);

  // Dohvati tekst važećeg propisa iz Baze zakona kad je odabran kao Verzija A ili B
  useEffect(() => {
    const targets = [sourceA, sourceB].filter((s) => s.startsWith(LAW_OPTION_PREFIX));
    for (const t of targets) {
      const lawName = t.slice(LAW_OPTION_PREFIX.length);
      if (enactedCache[lawName]) continue;
      setLoadingLaw(true);
      setLawError(null);
      getEnactedLawTextForDiffAction(lawName).then((res) => {
        setLoadingLaw(false);
        if (res.error) {
          setLawError(res.error);
        } else {
          setEnactedCache((prev) => ({
            ...prev,
            [lawName]: { label: res.label, text: res.rawText },
          }));
        }
      });
    }
  }, [sourceA, sourceB, enactedCache]);

  const resolvedA = useMemo(() => {
    if (sourceA.startsWith(LAW_OPTION_PREFIX)) {
      const lawName = sourceA.slice(LAW_OPTION_PREFIX.length);
      const cached = enactedCache[lawName];
      return cached ? { label: cached.label, text: cached.text, struct: undefined } : null;
    }
    const doc = draftDocs.find((d) => d.id === sourceA);
    return doc ? { label: doc.prikazniNaziv, text: doc.rawText, struct: doc.parsedDraft } : null;
  }, [sourceA, draftDocs, enactedCache]);

  const resolvedB = useMemo(() => {
    if (sourceB.startsWith(LAW_OPTION_PREFIX)) {
      const lawName = sourceB.slice(LAW_OPTION_PREFIX.length);
      const cached = enactedCache[lawName];
      return cached ? { label: cached.label, text: cached.text, struct: undefined } : null;
    }
    const doc = draftDocs.find((d) => d.id === sourceB);
    return doc ? { label: doc.prikazniNaziv, text: doc.rawText, struct: doc.parsedDraft } : null;
  }, [sourceB, draftDocs, enactedCache]);

  const diffResult = useMemo(() => {
    if (!resolvedA || !resolvedB) return null;
    const base = compareDraftVersions({
      versionALabel: resolvedA.label,
      versionAText: resolvedA.text,
      versionAStructure: resolvedA.struct,
      versionBLabel: resolvedB.label,
      versionBText: resolvedB.text,
      versionBStructure: resolvedB.struct,
    });
    return {
      ...base,
      items: base.items.map((it) => ({
        ...it,
        aiObrazlozenje: aiExplanations[it.key] || it.aiObrazlozenje,
      })),
    };
  }, [resolvedA, resolvedB, aiExplanations]);

  const visibleItems = useMemo(() => {
    if (!diffResult) return [];
    return onlyChanged
      ? diffResult.items.filter((i) => i.status !== 'nepromijenjeno')
      : diffResult.items;
  }, [diffResult, onlyChanged]);

  const handleGenerateExplanations = async () => {
    if (!diffResult) return;
    const changed = diffResult.items.filter((i) => i.status !== 'nepromijenjeno');
    if (changed.length === 0) return;
    setGeneratingAi(true);
    const res = await generateDiffExplanationsAction({
      puniNazivAkta: project.puniNazivAkta,
      versionALabel: diffResult.versionALabel,
      versionBLabel: diffResult.versionBLabel,
      changedItems: changed.map((c) => ({
        key: c.key,
        oznaka: c.oznaka,
        status: c.status,
        oldText: c.oldText,
        newText: c.newText,
      })),
    });
    setGeneratingAi(false);
    if (res.success && res.explanations) {
      setAiExplanations((prev) => ({ ...prev, ...res.explanations }));
    }
  };

  const handleExport = async (mode: 'diff_redline' | 'diff_tablica_promjena') => {
    if (!diffResult) return;
    setExportingMode(mode);
    try {
      const res = await fetch('/api/izrada-propisa/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: mode,
          projectName: project.naziv,
          puniNazivAkta: project.puniNazivAkta,
          versionALabel: diffResult.versionALabel,
          versionBLabel: diffResult.versionBLabel,
          onlyChanged,
          items: diffResult.items,
        }),
      });
      if (!res.ok) throw new Error('Greška pri izvozu.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        mode === 'diff_redline'
          ? `Usporedba_Redline_${project.naziv.replace(/\s+/g, '_')}.docx`
          : `Tablica_promjena_${project.naziv.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingMode(null);
    }
  };

  const statusPill = (status: ArticleDiffItem['status']) => {
    switch (status) {
      case 'izmijenjeno':
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      case 'dodano':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
      case 'brisano':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Kontrolna ploča za odabir dviju verzija */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Verzija A (starija / referentna)
            </label>
            <select
              value={sourceA}
              onChange={(e) => {
                setSourceA(e.target.value);
                setAiExplanations({});
              }}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <optgroup label="Nacrti u projektu">
                {draftDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.uloga === 'aktualni_nacrt' ? 'AKTUALNI' : 'VERZIJA'}] {d.prikazniNaziv}
                    {d.datumVerzije ? ` (${d.datumVerzije})` : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Važeći propisi iz Baze zakona">
                <option value={`${LAW_OPTION_PREFIX}${defaultEnactedLaw}`}>
                  Važeći propis: {defaultEnactedLaw}
                </option>
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Verzija B (novija / Aktualni nacrt)
            </label>
            <select
              value={sourceB}
              onChange={(e) => {
                setSourceB(e.target.value);
                setAiExplanations({});
              }}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              {draftDocs.length === 0 ? (
                <option value="">(Nema učitanih nacrta u projektu)</option>
              ) : (
                draftDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.uloga === 'aktualni_nacrt' ? 'AKTUALNI' : 'VERZIJA'}] {d.prikazniNaziv}
                    {d.datumVerzije ? ` (${d.datumVerzije})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Statistika + prikazi + izvoz */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {diffResult && (
              <>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
                  Izmijenjeno: {diffResult.stats.modified}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
                  Dodano: {diffResult.stats.added}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-800">
                  Brisano: {diffResult.stats.removed}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  Nepromijenjeno: {diffResult.stats.unchanged}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('redline')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  viewMode === 'redline'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                Redline
              </button>
              <button
                type="button"
                onClick={() => setViewMode('side-by-side')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  viewMode === 'side-by-side'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                Usporedno
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(e) => setOnlyChanged(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Samo promijenjeni
            </label>

            <button
              type="button"
              disabled={!diffResult || generatingAi || diffResult.stats.modified + diffResult.stats.added + diffResult.stats.removed === 0}
              onClick={handleGenerateExplanations}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {generatingAi ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AI obrazloženje promjena
            </button>

            <button
              type="button"
              disabled={!diffResult || exportingMode !== null}
              onClick={() => handleExport('diff_redline')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {exportingMode === 'diff_redline' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Redline .docx
            </button>

            <button
              type="button"
              disabled={!diffResult || exportingMode !== null}
              onClick={() => handleExport('diff_tablica_promjena')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {exportingMode === 'diff_tablica_promjena' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Tablica promjena .docx
            </button>
          </div>
        </div>
      </div>

      {lawError && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {lawError}
        </div>
      )}

      {loadingLaw ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-2 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-xs">Dohvaćam važeći tekst propisa iz Baze zakona...</span>
        </div>
      ) : !diffResult ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center space-y-2">
          <GitCompareArrows className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Učitajte barem jedan nacrt propisa za usporedbu po člancima.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Možete uspoređivati dvije verzije nacrta (npr. 13. 5. 2026. vs. 11. 11. 2026.) ili nacrt izravno s važećom Uredbom iz Baze zakona (0 AI troška).
          </p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-8 text-center text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          Odabrane dvije verzije su u potpunosti identične (nema promijenjenih članaka).
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <div
              key={item.key}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs"
            >
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {item.oznaka}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold uppercase px-2 py-0.5 rounded border ${statusPill(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>
                {item.status !== 'nepromijenjeno' && (
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                      +{item.addedWords}
                    </span>
                    <span className="text-rose-700 dark:text-rose-400 font-bold">
                      -{item.removedWords}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                {viewMode === 'redline' ? (
                  <div className="text-xs leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200 font-sans">
                    {item.tokens.map((tok, idx) => {
                      if (tok.type === 'removed') {
                        return (
                          <del
                            key={idx}
                            className="bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 line-through px-0.5 rounded"
                          >
                            {tok.text}
                          </del>
                        );
                      }
                      if (tok.type === 'added') {
                        return (
                          <ins
                            key={idx}
                            className="bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 no-underline font-semibold underline decoration-emerald-500 px-0.5 rounded"
                          >
                            {tok.text}
                          </ins>
                        );
                      }
                      return <React.Fragment key={idx}>{tok.text}</React.Fragment>;
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-rose-50/30 dark:bg-rose-950/15 border border-rose-200/60 dark:border-rose-900/50 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">
                        Verzija A: {diffResult.versionALabel}
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">
                        {item.oldText || '— (članak nije postojao)'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50/30 dark:bg-emerald-950/15 border border-emerald-200/60 dark:border-emerald-900/50 space-y-1">
                      <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                        Verzija B: {diffResult.versionBLabel}
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200">
                        {item.newText || '— (članak je brisan)'}
                      </div>
                    </div>
                  </div>
                )}

                {item.aiObrazlozenje && (
                  <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/70 text-xs text-indigo-950 dark:text-indigo-200">
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">
                      Obrazloženje promjene:{' '}
                    </span>
                    {item.aiObrazlozenje}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
