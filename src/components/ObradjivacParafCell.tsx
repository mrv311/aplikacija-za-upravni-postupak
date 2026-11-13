'use client';

import React, { useEffect, useState } from 'react';
import { Stamp, UserCheck } from 'lucide-react';
import { getSluzbeniciAction } from '@/app/actions/predmetActions';
import {
  formatIsoDateHr,
  getInitials,
  PARAF_STATUSI,
  type EnrichedPredmet,
  type Sluzbenik,
} from '@/lib/predmet-meta';

/**
 * Učitava popis službenika i automatski se sinkronizira kad se popis uredi u modalu.
 */
export function useSluzbeniciList() {
  const [sluzbenici, setSluzbenici] = useState<Sluzbenik[]>([]);

  useEffect(() => {
    let active = true;
    getSluzbeniciAction().then((data) => {
      if (active) setSluzbenici(data);
    });

    const handleSluzbeniciUpdated = (e: Event) => {
      const custom = e as CustomEvent<Sluzbenik[]>;
      if (custom.detail) {
        setSluzbenici(custom.detail);
      } else {
        getSluzbeniciAction().then((data) => {
          if (active) setSluzbenici(data);
        });
      }
    };

    window.addEventListener('sluzbenici-updated', handleSluzbeniciUpdated);
    return () => {
      active = false;
      window.removeEventListener('sluzbenici-updated', handleSluzbeniciUpdated);
    };
  }, []);

  return [sluzbenici, setSluzbenici] as const;
}

interface ObradjivacParafCellProps {
  predmet: EnrichedPredmet;
  onOpenModal: (tab: 'paraf' | 'delegiranje') => void;
}

/**
 * Zajednička tablična ćelija za delegiranje predmeta u rad službeniku i pregled/evidenciju parafa.
 */
export function ObradjivacParafCell({ predmet, onOpenModal }: ObradjivacParafCellProps) {
  const latestParaf =
    Array.isArray(predmet.parafi) && predmet.parafi.length > 0 ? predmet.parafi[0] : null;
  const latestParafStatus = latestParaf
    ? PARAF_STATUSI.find((s) => s.value === latestParaf.status) || PARAF_STATUSI[0]
    : null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      {/* Zaduženi službenik */}
      {predmet.sluzbenik_ime ? (
        <div className="flex flex-col items-start gap-0.5">
          <button
            type="button"
            onClick={() => onOpenModal('delegiranje')}
            title={
              predmet.uputa_voditelja
                ? `Uputa: ${predmet.uputa_voditelja}`
                : 'Kliknite za izmjenu zaduženog službenika ili upute'
            }
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
              {getInitials(predmet.sluzbenik_ime)}
            </span>
            <span className="truncate max-w-36">{predmet.sluzbenik_ime}</span>
          </button>
          {predmet.interni_rok && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 pl-0.5">
              Interni rok: {formatIsoDateHr(predmet.interni_rok)}
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenModal('delegiranje')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
          title="Delegiraj predmet službeniku u rad"
        >
          <UserCheck className="w-3 h-3" />
          <span>Delegiraj u rad</span>
        </button>
      )}

      {/* Zadnji paraf ili gumb za parafiranje */}
      <div className="flex items-center gap-1 flex-wrap">
        {latestParaf && latestParafStatus ? (
          <button
            type="button"
            onClick={() => onOpenModal('paraf')}
            title={`${latestParaf.status}: ${latestParaf.vrsta_akta} (${new Date(
              latestParaf.datum
            ).toLocaleDateString('hr-HR')})${
              latestParaf.napomena ? ` — ${latestParaf.napomena}` : ''
            }`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:opacity-85 transition-opacity ${latestParafStatus.badgeClass}`}
          >
            <Stamp className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate max-w-44">
              {latestParaf.status === 'Parafirano'
                ? 'Paraf:'
                : latestParaf.status === 'Parafirano uz izmjene'
                ? 'Paraf (izmj.):'
                : 'Dorada:'}{' '}
              {latestParaf.vrsta_akta}
            </span>
            {predmet.parafi.length > 1 && (
              <span className="ml-0.5 opacity-80">(+{predmet.parafi.length - 1})</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenModal('paraf')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50/70 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-[10px] font-bold transition-colors cursor-pointer"
            title="Evidentiraj paraf dopisa ili rješenja u ovom predmetu"
          >
            <Stamp className="w-2.5 h-2.5" />
            <span>+ Evidentiraj paraf</span>
          </button>
        )}
      </div>
    </div>
  );
}
