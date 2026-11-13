'use client';

import React from 'react';
import type { UpravniSpor } from '@/lib/upravni-sporovi';

interface SporDualAnnulmentInfoProps {
  spor: UpravniSpor;
  variant: 'badge' | 'card';
  onEdit?: () => void;
}

function hasReturnedFileEvidence(spor: UpravniSpor): boolean {
  const aktLower = (spor.aktUpIiPoPresudi || '').toLowerCase();
  const napomenaLower = (spor.vrijednostNapomena || '').toLowerCase();
  return (
    !!spor.isAktDone ||
    aktLower.includes('dopis') ||
    aktLower.includes('prosl') ||
    aktLower.includes('prema hv') ||
    aktLower.includes('vrać') ||
    aktLower.includes('vrac') ||
    napomenaLower.includes('spis vrać') ||
    napomenaLower.includes('spis vrac')
  );
}

/**
 * Prikazuje informaciju o postupanju kada je sud poništio i prvostupanjsko i drugostupanjsko rješenje
 * (nema obveze donošenja novog II. rješenja — spis se dopisom vraća I. stupnju).
 */
export default function SporDualAnnulmentInfo({ spor, variant, onEdit }: SporDualAnnulmentInfoProps) {
  const returned = hasReturnedFileEvidence(spor);

  if (variant === 'badge') {
    return (
      <span
        className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-2xs font-semibold border ${
          returned
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
            : 'bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200 border-sky-300 dark:border-sky-800'
        }`}
        title="Sud je poništio i I. i II. rješenje — nema obveze donošenja II. rješenja; spis se dopisom vraća I. stupnju."
      >
        {returned
          ? '✓ Poništeno I. i II. — spis vraćen I. stupnju'
          : '↩ Poništeno I. i II. — dopisom vratiti I. stupnju'}
      </span>
    );
  }

  return (
    <div className="mt-1 p-2.5 rounded-lg bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 space-y-1.5">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-200 border border-sky-300 dark:border-sky-700">
        ↩ Poništeno I. i II. rješenje — nema obveze II. rješenja
      </span>
      <p className="text-2xs text-sky-900 dark:text-sky-200 leading-relaxed">
        Obveza Ministarstva je <strong>dopisom vratiti predmet na prvi stupanj</strong> (Hrvatske vode / nadležno prvostupanjsko tijelo), koji zatim postupa sukladno presudi upravnog suda.
      </p>
      <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
        {spor.aktUpIiPoPresudi ? (
          <strong className="text-2xs text-emerald-700 dark:text-emerald-400">
            ✓ Evidentirano: {spor.aktUpIiPoPresudi}
          </strong>
        ) : returned && spor.vrijednostNapomena ? (
          <strong className="text-2xs text-emerald-700 dark:text-emerald-400">
            ✓ Vraćeno ({spor.vrijednostNapomena})
          </strong>
        ) : (
          <span className="text-2xs text-slate-500 dark:text-slate-400 italic">
            Dopis I. stupnju još nije evidentiran u stupcu L
          </span>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-2xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            + Uredi / Unesi dopis
          </button>
        )}
      </div>
    </div>
  );
}
