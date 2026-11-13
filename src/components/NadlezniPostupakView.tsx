'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Send,
  Clock,
  CheckCircle2,
  RotateCcw,
  Search,
  ExternalLink,
  Pencil,
  Building2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  calculateZupDeadline,
  formatIsoDateHr,
  type EnrichedPredmet,
  type NadlezniPostupakStatus,
} from '@/lib/predmet-meta';
import { NadlezniPostupakModal } from './NadlezniPostupakModal';

interface NadlezniPostupakViewProps {
  predmeti: EnrichedPredmet[];
}

type StatusFilter = 'aktivno' | 'potrebno_poslati' | 'poslano' | 'vraceno';
type SortMode = 'prioritet' | 'zaprimljeno_stari' | 'zaprimljeno_novi' | 'stranka';

function daysSinceIso(isoDate?: string): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const utcStart = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((utcNow - utcStart) / (1000 * 60 * 60 * 24)));
}

export function NadlezniPostupakView({ predmeti }: NadlezniPostupakViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('aktivno');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('prioritet');
  const [modalState, setModalState] = useState<{
    predmet: EnrichedPredmet;
    initialMode?: NadlezniPostupakStatus;
  } | null>(null);

  const stats = useMemo(() => {
    let potrebnoPoslatiCount = 0;
    let poslanoCount = 0;
    let vracenoCount = 0;

    for (const p of predmeti) {
      if (p.nadlezni_postupak_status === 'potrebno_poslati') potrebnoPoslatiCount++;
      else if (p.nadlezni_postupak_status === 'poslano') poslanoCount++;
      else if (p.nadlezni_postupak_status === 'vraceno') vracenoCount++;
    }

    return {
      ukupnoAktivno: potrebnoPoslatiCount + poslanoCount,
      potrebnoPoslatiCount,
      poslanoCount,
      vracenoCount,
    };
  }, [predmeti]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = predmeti.filter((p) => {
      const st = p.nadlezni_postupak_status;
      if (statusFilter === 'aktivno') {
        if (st !== 'potrebno_poslati' && st !== 'poslano') return false;
      } else if (st !== statusFilter) {
        return false;
      }

      if (q) {
        const matches =
          p.klasa.toLowerCase().includes(q) ||
          p.urbroj.toLowerCase().includes(q) ||
          p.stranka.toLowerCase().includes(q) ||
          (p.napomena || '').toLowerCase().includes(q) ||
          (p.nadlezni_postupak_tijelo || '').toLowerCase().includes(q) ||
          (p.nadlezni_postupak_napomena || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'stranka') {
        return (a.stranka || '').localeCompare(b.stranka || '', 'hr');
      }
      if (sortBy === 'zaprimljeno_novi') {
        return (b.datum_zaprimanja || '').localeCompare(a.datum_zaprimanja || '');
      }
      if (sortBy === 'zaprimljeno_stari') {
        return (a.datum_zaprimanja || '').localeCompare(b.datum_zaprimanja || '');
      }
      // Prioritet: najprije oni koji čekaju slanje (najstariji prvi), zatim poslani (najstariji poslani prvi)
      const rank = (s: NadlezniPostupakStatus) =>
        s === 'potrebno_poslati' ? 0 : s === 'poslano' ? 1 : 2;
      const diffRank = rank(a.nadlezni_postupak_status) - rank(b.nadlezni_postupak_status);
      if (diffRank !== 0) return diffRank;

      if (a.nadlezni_postupak_status === 'poslano') {
        return (a.nadlezni_postupak_datum_slanja || a.datum_zaprimanja || '').localeCompare(
          b.nadlezni_postupak_datum_slanja || b.datum_zaprimanja || ''
        );
      }
      return (a.datum_zaprimanja || '').localeCompare(b.datum_zaprimanja || '');
    });

    return list;
  }, [predmeti, statusFilter, search, sortBy]);

  return (
    <div className="space-y-5">
      {/* Informativna traka o pravnoj osnovi */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/70 text-xs text-amber-900 dark:text-amber-200">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Žalbe predane izravno Ministarstvu (čl. 110. st. 1. ZUP-a):</strong>{' '}
          drugostupanjsko tijelo mora žalbu bez odgode poslati tijelu prvog stupnja na nadležni
          postupak. Ovdje pratite predmete koje je potrebno žurno otpremiti te one koji su već
          poslani i čekaju dostavu kompletnog spisa s očitovanjem.
        </p>
      </div>

      {/* 1. BRZE STATISTIČKE KARTICE */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter('aktivno')}
          className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'aktivno'
              ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 shadow-2xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Ukupno na nadležnom postupku
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {stats.ukupnoAktivno}
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(
              statusFilter === 'potrebno_poslati' ? 'aktivno' : 'potrebno_poslati'
            )
          }
          className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'potrebno_poslati'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 dark:border-amber-700 shadow-2xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-800'
          }`}
        >
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Potrebno žurno poslati
          </p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
            {stats.potrebnoPoslatiCount}
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'poslano' ? 'aktivno' : 'poslano')
          }
          className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'poslano'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 shadow-2xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-900'
          }`}
        >
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Poslano I. stupnju (čeka povrat)
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
            {stats.poslanoCount}
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'vraceno' ? 'aktivno' : 'vraceno')
          }
          className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'vraceno'
              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 shadow-2xs'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900'
          }`}
        >
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            Vraćeno u rješavanje (povijest)
          </p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
            {stats.vracenoCount}
          </p>
        </button>
      </div>

      {/* 2. TRAŽILICA I SORTIRANJE */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po klasi, stranci, tijelu I. stupnja ili bilješci..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="aktivno">Aktivno: Za poslati + Poslano</option>
            <option value="potrebno_poslati">Samo: Potrebno poslati</option>
            <option value="poslano">Samo: Poslano I. stupnju</option>
            <option value="vraceno">Povijest: Vraćeno u rad</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="prioritet">Sortiraj: Prioritet (najprije za poslati)</option>
            <option value="zaprimljeno_stari">Sortiraj: Najstariji primitak prvi</option>
            <option value="zaprimljeno_novi">Sortiraj: Najnoviji primitak prvi</option>
            <option value="stranka">Sortiraj: Stranka (A–Ž)</option>
          </select>

          <span className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200/70 dark:border-slate-700">
            {filteredItems.length}
          </span>
        </div>
      </div>

      {/* 3. TABLICA PREDMETA NA NADLEŽNOM POSTUPKU */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200/90 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3.5">KLASA / Područje</th>
                <th className="px-4 py-3.5">Stranka / Žalitelj</th>
                <th className="px-4 py-3.5">Zaprimljeno (Min.) & ZUP rok</th>
                <th className="px-4 py-3.5">Status slanja I. stupnju</th>
                <th className="px-4 py-3.5 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
                        <Send className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base mb-1">
                        Nema predmeta za odabrani prikaz
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Kad zaprimite žalbu poslanu izravno Ministarstvu, označite je pri otvaranju
                        novog predmeta ili kliknite ikonu slanja pored predmeta u kartici{' '}
                        <strong>„U radu”</strong>.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((predmet) => {
                  const waitDays = daysSinceIso(predmet.datum_zaprimanja);
                  const sentDays = daysSinceIso(predmet.nadlezni_postupak_datum_slanja);
                  const deadline = calculateZupDeadline(predmet.datum_predaje_zalbe);
                  const st = predmet.nadlezni_postupak_status;

                  return (
                    <tr
                      key={predmet.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* KLASA / Područje / Napomena */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/predmeti/${predmet.id}`}
                            className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {predmet.klasa}
                          </Link>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {predmet.podrucje}
                          </span>
                        </div>
                        {predmet.napomena && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-1 line-clamp-1 max-w-xs">
                            „{predmet.napomena}”
                          </p>
                        )}
                      </td>

                      {/* Stranka */}
                      <td className="px-4 py-3.5 align-top">
                        <Link
                          href={`/predmeti/${predmet.id}`}
                          className="font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 block max-w-56 truncate"
                        >
                          {predmet.stranka || '-'}
                        </Link>
                      </td>

                      {/* Zaprimanje & ZUP rok */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                          {formatIsoDateHr(predmet.datum_zaprimanja) || '-'}
                          {waitDays !== null && st === 'potrebno_poslati' && (
                            <span
                              className={`ml-1.5 font-bold ${
                                waitDays >= 5
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              (čeka {waitDays} d.)
                            </span>
                          )}
                        </p>
                        {deadline ? (
                          <span
                            title={`Zakonski rok (60 dana od predaje žalbe, čl. 121. ZUP-a) istječe: ${deadline.deadlineDateFormatted}`}
                            className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                              deadline.urgency === 'overdue'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : deadline.urgency === 'warning'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {deadline.label}
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
                            Bez upisanog datuma žalbe
                          </span>
                        )}
                      </td>

                      {/* Status slanja I. stupnju */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex flex-col items-start gap-1">
                          {st === 'potrebno_poslati' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100/90 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                              <Clock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                              POTREBNO ŽURNO POSLATI
                            </span>
                          ) : st === 'poslano' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              POSLANO {formatIsoDateHr(predmet.nadlezni_postupak_datum_slanja)}
                              {sentDays !== null && (
                                <span className="font-semibold opacity-80">
                                  (prije {sentDays} d.)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <RotateCcw className="w-3.5 h-3.5" />
                              VRAĆENO {formatIsoDateHr(predmet.nadlezni_postupak_datum_povratka)}
                            </span>
                          )}

                          {predmet.nadlezni_postupak_tijelo && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {predmet.nadlezni_postupak_tijelo}
                            </span>
                          )}

                          {predmet.nadlezni_postupak_napomena && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs line-clamp-2">
                              {predmet.nadlezni_postupak_napomena}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Brze akcije */}
                      <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {st === 'potrebno_poslati' && (
                            <button
                              type="button"
                              onClick={() =>
                                setModalState({ predmet, initialMode: 'poslano' })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                              title="Označi da je dopis poslan prvostupanjskom tijelu i upiši datum slanja"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Evidentiraj slanje</span>
                            </button>
                          )}

                          {st === 'poslano' && (
                            <button
                              type="button"
                              onClick={() =>
                                setModalState({ predmet, initialMode: 'vraceno' })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                              title="Prvostupanjsko tijelo dostavilo je spis i očitovanje — vrati predmet u rješavanje"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Spis vraćen u rad</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setModalState({ predmet })}
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Uredi podatke o slanju na nadležni postupak"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <Link
                            href={`/predmeti/${predmet.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-lg transition-colors"
                            title="Otvori spis i AI analizu"
                          >
                            <span>Spis</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NadlezniPostupakModal
        predmet={modalState?.predmet || null}
        isOpen={Boolean(modalState)}
        initialMode={modalState?.initialMode}
        onClose={() => setModalState(null)}
      />
    </div>
  );
}
