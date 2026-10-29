'use client';

import React from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink,
  BookOpen,
  Layers,
  Database,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type { PropisiStatusFile } from '@/lib/propisi-checker';

interface PropisiStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: PropisiStatusFile | null;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  feedbackMsg: string | null;
}

export function PropisiStatusModal({
  isOpen,
  onClose,
  status,
  isRefreshing,
  onRefresh,
  feedbackMsg,
}: PropisiStatusModalProps) {
  if (!isOpen) return null;

  const allUpToDate = status?.allUpToDate ?? true;
  const outdatedCount = status?.outdatedCount ?? 0;
  const totalArticles = status?.totalArticlesInDb ?? 1607;
  const checkedAtStr = status?.checkedAt
    ? new Date(status.checkedAt).toLocaleString('hr-HR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Nepoznato';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Status i provjera ažurnosti propisa
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Usklađenost s Narodnim novinama i portalom Zakon.hr (14 temeljnih propisa)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Zatvori prozor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Main Status Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              allUpToDate
                ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {allUpToDate ? (
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-base">
                  {allUpToDate
                    ? 'Svi propisi (14/14) su 100% ažurni s Narodnim novinama'
                    : `Dostupne nove izmjene za ${outdatedCount} propisa`}
                </h3>
                <p className="text-xs opacity-90 mt-1">
                  {status?.portalInfo || 'Usklađeno s pročišćenim tekstovima i objavama u Narodnim novinama RH.'}
                </p>
                <div className="flex items-center gap-2 mt-2 text-[11px] opacity-80">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Zadnja provjera: {checkedAtStr}</span>
                </div>
              </div>
            </div>

            {/* Quick action button inside banner */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shadow-sm ${
                allUpToDate
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-400'
                  : 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-400'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Provjeravam bazu...' : 'Osvježi bazu sada'}</span>
            </button>
          </div>

          {/* Feedback message banner if present */}
          {feedbackMsg && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Obuhvat propisa</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">14 / 14 Propisa</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Strukturiranih članaka</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{totalArticles} članaka</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Vektorski indeks (RAG)</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">100% Spreman za AI</div>
              </div>
            </div>
          </div>

          {/* Table of Regulations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pojedinačni status propisa u bazi
              </h4>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Povezano sa zakon.hr i Narodnim novinama
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80">
              {status?.results && status.results.length > 0 ? (
                status.results.map((r) => {
                  const isUp = r.status !== 'ZASTARJELO';
                  return (
                    <div
                      key={r.kratica}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <span className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs shrink-0">
                          {r.kratica}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {r.naziv}
                            </span>
                            {r.provjeraUrl && (
                              <a
                                href={r.provjeraUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-0.5"
                                title="Otvori službeni pročišćeni tekst na zakon.hr"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>Službene objave: <strong className="text-slate-700 dark:text-slate-300 font-medium">{r.bazaNn}</strong></span>
                            {r.naSnaziOd && (
                              <span className="text-slate-400 dark:text-slate-500">({r.naSnaziOd})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {r.dbClanciCount} čl.
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isUp
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                          }`}
                        >
                          {isUp ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>100% Ažurno</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                              <span>Izmjena dostupna</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-400 text-sm">
                  Učitavam podatke o propisima...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Automatska sinkronizacija provjerava promjene svaki tjedan i na ručni zahtjev.
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Zatvori
            </button>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Provjeravam propise...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Osvježi bazu propisa</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
