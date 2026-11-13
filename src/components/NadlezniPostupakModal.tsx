'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Clock,
  CheckCircle2,
  RotateCcw,
  X,
  Loader2,
  AlertTriangle,
  Building2,
  Calendar,
} from 'lucide-react';
import { updateNadlezniPostupakAction } from '@/app/actions/predmetActions';
import {
  formatIsoDateHr,
  type EnrichedPredmet,
  type NadlezniPostupakStatus,
} from '@/lib/predmet-meta';

interface NadlezniPostupakModalProps {
  predmet: EnrichedPredmet | null;
  isOpen: boolean;
  initialMode?: NadlezniPostupakStatus;
  onClose: () => void;
  onUpdated?: (updated: {
    id: string;
    status: NadlezniPostupakStatus;
    tijelo: string;
    datum_slanja: string;
    datum_povratka: string;
    napomena: string;
  }) => void;
}

const TIJELA_BRZI_ODABIR = [
  'Hrvatske vode',
  'Hrvatske vode — VGI',
  'Grad Zagreb',
];

function NadlezniPostupakModalInner({
  predmet,
  initialMode,
  onClose,
  onUpdated,
}: {
  predmet: EnrichedPredmet;
  initialMode?: NadlezniPostupakStatus;
  onClose: () => void;
  onUpdated?: NadlezniPostupakModalProps['onUpdated'];
}) {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const defaultStatus: NadlezniPostupakStatus =
    initialMode !== undefined
      ? initialMode
      : predmet.nadlezni_postupak_status || 'potrebno_poslati';

  const [status, setStatus] = useState<NadlezniPostupakStatus>(defaultStatus);
  const [tijelo, setTijelo] = useState(predmet.nadlezni_postupak_tijelo || 'Hrvatske vode');
  const [datumSlanja, setDatumSlanja] = useState(
    predmet.nadlezni_postupak_datum_slanja || (defaultStatus === 'poslano' ? today : '')
  );
  const [datumPovratka, setDatumPovratka] = useState(
    predmet.nadlezni_postupak_datum_povratka || (defaultStatus === 'vraceno' ? today : '')
  );
  const [napomena, setNapomena] = useState(predmet.nadlezni_postupak_napomena || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectStatus = (next: NadlezniPostupakStatus) => {
    setStatus(next);
    setErrorMsg(null);
    if (next === 'poslano' && !datumSlanja) {
      setDatumSlanja(today);
    }
    if (next === 'vraceno') {
      if (!datumSlanja) setDatumSlanja(predmet.nadlezni_postupak_datum_slanja || '');
      if (!datumPovratka) setDatumPovratka(today);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'poslano' && !datumSlanja.trim()) {
      setErrorMsg('Molimo unesite datum kada je predmet poslan prvostupanjskom tijelu.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = {
      status,
      tijelo: status === '' ? '' : tijelo.trim(),
      datum_slanja:
        status === 'poslano' || status === 'vraceno' ? datumSlanja.trim() : '',
      datum_povratka: status === 'vraceno' ? datumPovratka.trim() || today : '',
      napomena: status === '' ? '' : napomena.trim(),
    };

    const res = await updateNadlezniPostupakAction(predmet.id, payload);
    setSaving(false);

    if (res.error) {
      setErrorMsg(res.error);
      return;
    }

    onUpdated?.({
      id: predmet.id,
      status: payload.status,
      tijelo: payload.tijelo,
      datum_slanja: payload.datum_slanja,
      datum_povratka: payload.datum_povratka,
      napomena: payload.napomena,
    });
    onClose();
    router.refresh();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden"
      >
        {/* Zaglavlje */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Na nadležnom postupku (čl. 110. ZUP)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-sm">
              {predmet.klasa} • {predmet.stranka}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tijelo modala */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Odabir statusa slanja */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
              Status slanja prvostupanjskom tijelu
            </label>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => selectStatus('potrebno_poslati')}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  status === 'potrebno_poslati'
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 dark:border-amber-700 ring-1 ring-amber-400/50'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
                }`}
              >
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Potrebno žurno poslati tijelu I. stupnja
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Žalba zaprimljena izravno u Ministarstvu — čeka otpremu dopisa I. stupnju.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectStatus('poslano')}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  status === 'poslano'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-700 ring-1 ring-emerald-400/50'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Poslano I. stupnju na nadležni postupak
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Evidentiran datum slanja — čeka se dostava kompletnog spisa i očitovanja I. stupnja.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectStatus('vraceno')}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  status === 'vraceno'
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-700 ring-1 ring-blue-400/50'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300'
                }`}
              >
                <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Spis vraćen s I. stupnja u redovno rješavanje
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Prebacuje predmet natrag u karticu „U radu”, uz sačuvani trag kada je bio poslan.
                  </p>
                </div>
              </button>

              {predmet.nadlezni_postupak_status && (
                <button
                  type="button"
                  onClick={() => selectStatus('')}
                  className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer text-xs font-semibold ${
                    status === ''
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 text-slate-900 dark:text-slate-100'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ukloni oznaku nadležnog postupka (vrati u redovni rad bez traga slanja)
                </button>
              )}
            </div>
          </div>

          {/* Dodatna polja kad je u postupku */}
          {status !== '' && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Tijelo prvog stupnja
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {TIJELA_BRZI_ODABIR.map((naziv) => (
                      <button
                        key={naziv}
                        type="button"
                        onClick={() => setTijelo(naziv)}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        {naziv}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={tijelo}
                  onChange={(e) => setTijelo(e.target.value)}
                  placeholder="npr. Hrvatske vode, VGI za mali sliv..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {(status === 'poslano' || status === 'vraceno') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Datum slanja I. stupnju {status === 'poslano' ? '*' : ''}
                    </label>
                    <input
                      type="date"
                      value={datumSlanja}
                      onChange={(e) => setDatumSlanja(e.target.value)}
                      required={status === 'poslano'}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {status === 'vraceno' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        Datum povratka u Ministarstvo
                      </label>
                      <input
                        type="date"
                        value={datumPovratka}
                        onChange={(e) => setDatumPovratka(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Bilješka / Klasa otpremnog dopisa (opcijski)
                </label>
                <input
                  type="text"
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder={
                    status === 'potrebno_poslati'
                      ? 'npr. Žalba stigla poštom izravno u MZOZT, hitno otpremiti dopisom'
                      : 'npr. Otpremljeno dopisom URBROJ / preporučeno poštom'
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {predmet.nadlezni_postupak_datum_slanja && status === 'vraceno' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Prethodno evidentirano slanje:{' '}
                  <strong>{formatIsoDateHr(predmet.nadlezni_postupak_datum_slanja)}</strong>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Podnožje */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Odustani
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{saving ? 'Spremam...' : 'Spremi status'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function NadlezniPostupakModal({
  predmet,
  isOpen,
  initialMode,
  onClose,
  onUpdated,
}: NadlezniPostupakModalProps) {
  if (!isOpen || !predmet) return null;

  return (
    <NadlezniPostupakModalInner
      key={`${predmet.id}_${initialMode ?? 'default'}_${predmet.nadlezni_postupak_status}`}
      predmet={predmet}
      initialMode={initialMode}
      onClose={onClose}
      onUpdated={onUpdated}
    />
  );
}
