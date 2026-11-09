'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe,
  Search,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  DownloadCloud,
  Check,
  Scale,
  Building2,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  searchPortalDecisionsAction,
  importSelectedPortalDecisionsAction,
} from '@/app/actions/praksaActions';
import type { PortalSearchSummaryItem } from '@/lib/court-scraper';

interface PretraziPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_QUERIES = [
  { label: '🌊 Vodni doprinos', query: 'vodni doprinos' },
  { label: '💧 Naknada za uređenje voda', query: 'naknada za uređenje voda' },
  { label: '⚖️ Šutnja uprave i troškovi', query: 'šutnja uprave troškovi' },
  { label: '🔄 Obnova postupka (ZUP)', query: 'obnova postupka nove činjenice' },
  { label: '🚫 Poništavanje rješenja', query: 'poništavanje rješenja nezakonitost' },
  { label: '🏗️ Ozakonjenje zgrada (ZPNIZ)', query: 'nezakonito izgrađena zgrada naknada' },
];

export function PretraziPortalModal({ isOpen, onClose }: PretraziPortalModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<PortalSearchSummaryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success?: boolean;
    count?: number;
    chunks?: number;
    message?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || q.length < 2) return;

    if (overrideQuery) {
      setQuery(overrideQuery);
    }

    setIsSearching(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const res = await searchPortalDecisionsAction(q, 15);
      if (res.success && res.items) {
        setResults(res.items);
        // Pre-select new items (ones not already in DB)
        const newIds = res.items.filter((it) => !it.alreadyImported).map((it) => it.id);
        setSelectedIds(newIds);
      } else {
        setErrorMessage(res.error || 'Nije uspjelo pretraživanje portala.');
        setResults([]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Greška pri povezivanju s portalom sudova.');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (select: boolean) => {
    if (select) {
      const available = results.filter((r) => !r.alreadyImported).map((r) => r.id);
      setSelectedIds(available);
    } else {
      setSelectedIds([]);
    }
  };

  const handleImport = async () => {
    if (selectedIds.length === 0) return;

    setIsImporting(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const res = await importSelectedPortalDecisionsAction(selectedIds);
      if (res.success) {
        setImportResult({
          success: true,
          count: res.importedCount,
          chunks: res.totalChunks,
          message: `Uspješno uvezeno ${res.importedCount} sudskih odluka i generirano ${res.totalChunks} vektorskih odlomaka u RAG bazi!`,
        });

        // Ažuriraj stanje već uvezenih
        setResults((prev) =>
          prev.map((item) =>
            selectedIds.includes(item.id) ? { ...item, alreadyImported: true } : item
          )
        );
        setSelectedIds([]);

        startTransition(() => {
          router.refresh();
        });
      } else {
        setErrorMessage(res.error || 'Greška pri uvozu odabranih odluka.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Greška pri spremanju u bazu prakse.');
    } finally {
      setIsImporting(false);
    }
  };

  const getIshodBadgeClass = (ishod: string) => {
    if (ishod.includes('Poništen')) return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300';
    if (ishod.includes('Odbijen')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300';
    if (ishod.includes('Obustav')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300';
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Zaglavlje modala */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Pretraži javni portal sudskih odluka
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300">
                  odluke.sudovi.hr
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pronađite pravomoćne presude Visokog upravnog suda i upravnih sudova te ih jednim klikom uvezite u RAG bazu.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Polje za pretragu + Brze tematske oznake */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Upišite pojam, npr. 'vodni doprinos', 'članak 129 ZUP', 'obnova postupka'..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || query.trim().length < 2}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Tražim...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Pretraži portal</span>
                </>
              )}
            </button>
          </form>

          {/* Brzi odabiri */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mr-1">Preporučene teme:</span>
            {PRESET_QUERIES.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleSearch(p.query)}
                disabled={isSearching}
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-sky-300 border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tijelo: Lista rezultata */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-3 text-rose-800 dark:text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {importResult && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-start gap-3 text-emerald-800 dark:text-emerald-200 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{importResult.message}</p>
                <p className="text-[11px] mt-0.5 text-emerald-700 dark:text-emerald-300">
                  Odluke su spremljene na lokalni disk i RAG asistent ih automatski koristi u analizama spisa.
                </p>
              </div>
            </div>
          )}

          {isSearching && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
              <p className="text-xs">Dohvaćam najnovije odluke s portala odluke.sudovi.hr...</p>
            </div>
          )}

          {!isSearching && results.length === 0 && !errorMessage && (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <Scale className="w-12 h-12 mx-auto stroke-1 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium">Upišite pojam ili odaberite preporučenu temu iznad.</p>
              <p className="text-xs mt-1">Sustav pretražuje službenu bazu s preko 1,3 milijuna sudskih odluka.</p>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span>Pronađeno <strong>{results.length}</strong> odluka na javnom portalu</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="text-sky-600 hover:text-sky-500 font-semibold cursor-pointer"
                  >
                    Odaberi sve dostupne
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Poništi odabir
                  </button>
                </div>
              </div>

              {results.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => !item.alreadyImported && toggleSelect(item.id)}
                    className={`p-4 rounded-xl border transition-all select-none ${
                      item.alreadyImported
                        ? 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 opacity-75'
                        : isSelected
                        ? 'bg-sky-50/50 dark:bg-sky-950/30 border-sky-300 dark:border-sky-700 shadow-2xs cursor-pointer'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={isSelected || item.alreadyImported}
                          disabled={item.alreadyImported}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">
                            {item.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getIshodBadgeClass(
                              item.ishod
                            )}`}
                          >
                            {item.ishod}
                          </span>
                          {item.datum && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {item.datum}
                            </span>
                          )}
                          {item.alreadyImported && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1 ml-auto">
                              <Check className="w-3 h-3" />
                              Već u bazi
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                          {item.snippet}
                        </p>

                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {item.sud}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sky-600 hover:underline hover:text-sky-700"
                          >
                            <span>Otvori na odluke.sudovi.hr</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Podnožje modala s akcijom uvoza */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selectedIds.length > 0 ? (
              <span>
                Odabrano za uvoz: <strong className="text-slate-900 dark:text-white">{selectedIds.length}</strong> odluka
              </span>
            ) : (
              <span>Odaberite presude koje želite uvesti u bazu</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Zatvori
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || selectedIds.length === 0}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-bold text-xs shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uvozim i indeksiram ({selectedIds.length})...</span>
                </>
              ) : (
                <>
                  <DownloadCloud className="w-4 h-4" />
                  <span>Uvezi u bazu ({selectedIds.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
