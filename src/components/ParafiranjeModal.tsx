'use client';

import React, { useState, useEffect } from 'react';
import {
  Stamp,
  UserCheck,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Calendar,
  FileCheck2,
  RotateCcw,
  PenTool,
  Users,
  ClipboardList,
} from 'lucide-react';
import {
  PARAF_VRSTE_AKATA,
  PARAF_STATUSI,
  type EnrichedPredmet,
  type Sluzbenik,
  type ParafVrstaAkta,
  type ParafStatus,
  type ParafZapis,
  type PredmetFaza,
} from '@/lib/predmet-meta';
import {
  getSluzbeniciAction,
  assignPredmetSluzbenikAction,
  addPredmetParafAction,
  deletePredmetParafAction,
} from '@/app/actions/predmetActions';

interface ParafiranjeModalProps {
  predmet: EnrichedPredmet | null;
  isOpen: boolean;
  initialTab?: 'paraf' | 'delegiranje';
  sluzbeniciList?: Sluzbenik[];
  onClose: () => void;
  onManageSluzbenici?: () => void;
  onUpdated?: (updatedPredmetPatch: Partial<EnrichedPredmet>) => void;
}

export function ParafiranjeModal({
  predmet,
  isOpen,
  initialTab = 'paraf',
  sluzbeniciList,
  onClose,
  onManageSluzbenici,
  onUpdated,
}: ParafiranjeModalProps) {
  const today = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<'paraf' | 'delegiranje'>(initialTab);
  const [sluzbenici, setSluzbenici] = useState<Sluzbenik[]>(sluzbeniciList || []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Polja za Delegiranje (Zaduženje službenika)
  const [selectedSluzbenikId, setSelectedSluzbenikId] = useState('');
  const [selectedSluzbenikIme, setSelectedSluzbenikIme] = useState('');
  const [datumDodjele, setDatumDodjele] = useState(today);
  const [interniRok, setInterniRok] = useState('');
  const [uputaVoditelja, setUputaVoditelja] = useState('');

  // Polja za Parafiranje akta
  const [vrstaAkta, setVrstaAkta] = useState<ParafVrstaAkta>('Drugostupanjsko rješenje');
  const [statusParafa, setStatusParafa] = useState<ParafStatus>('Parafirano');
  const [parafSluzbenikIme, setParafSluzbenikIme] = useState('');
  const [datumParafa, setDatumParafa] = useState(today);
  const [napomenaParafa, setNapomenaParafa] = useState('');
  const [autoUpdateFaza, setAutoUpdateFaza] = useState(true);

  // Lokalni prikaz povijesti parafa
  const [parafiHistory, setParafiHistory] = useState<ParafZapis[]>([]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (sluzbeniciList && sluzbeniciList.length > 0) {
      setSluzbenici(sluzbeniciList);
    } else if (isOpen) {
      getSluzbeniciAction().then(setSluzbenici);
    }
  }, [isOpen, sluzbeniciList]);

  useEffect(() => {
    if (!predmet || !isOpen) return;
    setFeedback(null);
    setSelectedSluzbenikId(predmet.sluzbenik_id || '');
    setSelectedSluzbenikIme(predmet.sluzbenik_ime || '');
    setDatumDodjele(predmet.datum_dodjele || today);
    setInterniRok(predmet.interni_rok || '');
    setUputaVoditelja(predmet.uputa_voditelja || '');

    setParafSluzbenikIme(predmet.sluzbenik_ime || '');
    setDatumParafa(today);
    setNapomenaParafa('');
    setParafiHistory(Array.isArray(predmet.parafi) ? predmet.parafi : []);
  }, [predmet, isOpen, today]);

  if (!isOpen || !predmet) return null;

  // Odredi predloženu novu fazu predmeta pri parafiranju
  const getSuggestedNextFaza = (): PredmetFaza | undefined => {
    if (!autoUpdateFaza) return undefined;
    if (statusParafa === 'Vraćeno na doradu') {
      return 'U radu';
    }
    if (
      vrstaAkta === 'Dopis — slanje žalbe na nadležni postupak' ||
      vrstaAkta === 'Dopis — traženje dopune spisa / očitovanja'
    ) {
      return 'Čeka dopunu';
    }
    if (vrstaAkta === 'Drugostupanjsko rješenje') {
      return 'Na potpisu';
    }
    return undefined;
  };

  const suggestedFaza = getSuggestedNextFaza();

  const handleSaveDelegiranje = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);

    const res = await assignPredmetSluzbenikAction(predmet.id, {
      sluzbenik_id: selectedSluzbenikId,
      sluzbenik_ime: selectedSluzbenikIme,
      datum_dodjele: selectedSluzbenikIme ? datumDodjele : '',
      interni_rok: interniRok,
      uputa_voditelja: uputaVoditelja,
    });

    setBusy(false);
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
    } else {
      const novaFaza =
        selectedSluzbenikIme && (!predmet.faza || predmet.faza === 'Novo')
          ? ('U radu' as PredmetFaza)
          : predmet.faza;

      setParafSluzbenikIme(selectedSluzbenikIme);
      onUpdated?.({
        sluzbenik_id: selectedSluzbenikId,
        sluzbenik_ime: selectedSluzbenikIme,
        datum_dodjele: selectedSluzbenikIme ? datumDodjele : '',
        interni_rok: interniRok,
        uputa_voditelja: uputaVoditelja,
        faza: novaFaza,
      });

      setFeedback({
        type: 'success',
        text: selectedSluzbenikIme
          ? `Predmet je delegiran u rad službeniku: ${selectedSluzbenikIme}.`
          : 'Zaduženje službenika je ažurirano.',
      });
    }
  };

  const handleAddParaf = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);

    const nextFaza = getSuggestedNextFaza();
    const res = await addPredmetParafAction(
      predmet.id,
      {
        datum: datumParafa,
        vrsta_akta: vrstaAkta,
        status: statusParafa,
        sluzbenik_ime: parafSluzbenikIme.trim() || selectedSluzbenikIme,
        napomena: napomenaParafa.trim(),
      },
      nextFaza
    );

    setBusy(false);
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
    } else if (res.parafi) {
      setParafiHistory(res.parafi);
      setNapomenaParafa('');
      onUpdated?.({
        parafi: res.parafi,
        ...(nextFaza ? { faza: nextFaza } : {}),
      });
      setFeedback({
        type: 'success',
        text: `Evidentirano: ${statusParafa} — ${vrstaAkta}${
          nextFaza ? ` (faza predmeta: ${nextFaza})` : ''
        }.`,
      });
    }
  };

  const handleDeleteParaf = async (parafId: string) => {
    setBusy(true);
    const res = await deletePredmetParafAction(predmet.id, parafId);
    setBusy(false);
    if (res.parafi) {
      setParafiHistory(res.parafi);
      onUpdated?.({ parafi: res.parafi });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Zaglavlje */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">
                {predmet.klasa}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                {predmet.podrucje}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate max-w-md">
              Stranka: <strong>{predmet.stranka}</strong>
              {selectedSluzbenikIme ? ` • U radu kod: ${selectedSluzbenikIme}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigacijski tabovi */}
        <div className="px-6 pt-3 bg-slate-50/60 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('paraf');
                setFeedback(null);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'paraf'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Stamp className="w-4 h-4" />
              <span>Parafiranje dopisa / rješenja</span>
              {parafiHistory.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {parafiHistory.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('delegiranje');
                setFeedback(null);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'delegiranje'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Delegiranje u rad (Zaduženje)</span>
            </button>
          </div>

          {onManageSluzbenici && (
            <button
              type="button"
              onClick={onManageSluzbenici}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 mb-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Popis službenika</span>
            </button>
          )}
        </div>

        {/* Sadržaj modala */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                feedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
              }`}
            >
              {feedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {activeTab === 'paraf' ? (
            <>
              {/* FORMA ZA NOVI PARAF */}
              <form
                onSubmit={handleAddParaf}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Evidentiraj pregled / paraf akta u predmetu
                  </h4>
                </div>

                {/* 1. Vrsta akta */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    1. Vrsta akta koji parafirate / pregledavate *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PARAF_VRSTE_AKATA.map((vrsta) => {
                      const active = vrstaAkta === vrsta;
                      return (
                        <button
                          key={vrsta}
                          type="button"
                          onClick={() => setVrstaAkta(vrsta)}
                          className={`text-left px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                          }`}
                        >
                          {vrsta}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Status pregleda / parafa */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    2. Odluka nadređenog (Status parafa) *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {PARAF_STATUSI.map((st) => {
                      const active = statusParafa === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          onClick={() => setStatusParafa(st.value)}
                          className={`px-3 py-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            active
                              ? st.value === 'Parafirano'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : st.value === 'Parafirano uz izmjene'
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {st.value === 'Parafirano' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {st.value === 'Parafirano uz izmjene' && (
                            <PenTool className="w-3.5 h-3.5" />
                          )}
                          {st.value === 'Vraćeno na doradu' && (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          <span>{st.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Službenik i Datum parafa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Službenik koji je izradio akt
                    </label>
                    <select
                      value={parafSluzbenikIme}
                      onChange={(e) => setParafSluzbenikIme(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Odaberite službenika —</option>
                      {sluzbenici.map((s) => (
                        <option key={s.id} value={s.imePrezime}>
                          {s.imePrezime} {s.radnoMjesto ? `(${s.radnoMjesto})` : ''}
                        </option>
                      ))}
                      {parafSluzbenikIme &&
                        !sluzbenici.some((s) => s.imePrezime === parafSluzbenikIme) && (
                          <option value={parafSluzbenikIme}>{parafSluzbenikIme}</option>
                        )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Datum parafa / pregleda
                    </label>
                    <input
                      type="date"
                      value={datumParafa}
                      onChange={(e) => setDatumParafa(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 4. Zabilješka uz paraf / razlog vraćanja na doradu */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Zabilješka uz paraf ili uputa za doradu (opcijski)
                  </label>
                  <input
                    type="text"
                    value={napomenaParafa}
                    onChange={(e) => setNapomenaParafa(e.target.value)}
                    placeholder={
                      statusParafa === 'Vraćeno na doradu'
                        ? 'npr. Dopuniti obrazloženje u dijelu prigovora zastare po čl. 108. OPZ-a'
                        : vrstaAkta === 'Dopis — slanje žalbe na nadležni postupak'
                        ? 'npr. Žalba poslana Hrvatskim vodama na postupanje po čl. 113. ZUP-a'
                        : 'npr. Uredno sastavljen nacrt, proslijeđeno čelniku na potpis'
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Automatsko ažuriranje faze predmeta */}
                {suggestedFaza && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={autoUpdateFaza}
                      onChange={(e) => setAutoUpdateFaza(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>
                      Automatski postavi radnu fazu predmeta u{' '}
                      <strong className="text-blue-700 dark:text-blue-400">
                        „{suggestedFaza}”
                      </strong>
                    </span>
                  </label>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Stamp className="w-3.5 h-3.5" />
                    )}
                    <span>Spremi u evidenciju parafa</span>
                  </button>
                </div>
              </form>

              {/* POVIJEST PARAFA U OVOM PREDMETU */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Dosadašnji parafi i pregledi u ovom predmetu ({parafiHistory.length})
                </h4>

                {parafiHistory.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    U ovom predmetu još nema evidentiranih parafa.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {parafiHistory.map((pf) => {
                      const statusMeta =
                        PARAF_STATUSI.find((s) => s.value === pf.status) || PARAF_STATUSI[0];
                      return (
                        <div
                          key={pf.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeClass}`}
                              >
                                <Stamp className="w-3 h-3" />
                                {pf.status}
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {pf.vrsta_akta}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                •{' '}
                                {pf.datum
                                  ? new Date(pf.datum).toLocaleDateString('hr-HR')
                                  : '-'}
                              </span>
                            </div>

                            {pf.sluzbenik_ime && (
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Službenik: <strong>{pf.sluzbenik_ime}</strong>
                              </p>
                            )}

                            {pf.napomena && (
                              <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800/70 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700">
                                „{pf.napomena}”
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteParaf(pf.id)}
                            disabled={busy}
                            title="Obriši zapis o parafu"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* TAB 2: DELEGIRANJE PREDMETA U RAD SLUŽBENIKU */
            <form onSubmit={handleSaveDelegiranje} className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/50 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Zaduženi službenik (Obrađivač predmeta)
                    </label>
                    {onManageSluzbenici && (
                      <button
                        type="button"
                        onClick={onManageSluzbenici}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        + Dodaj ili uredi službenike
                      </button>
                    )}
                  </div>

                  <select
                    value={selectedSluzbenikId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSluzbenikId(val);
                      if (!val) {
                        setSelectedSluzbenikIme('');
                      } else {
                        const found = sluzbenici.find((s) => s.id === val);
                        if (found) setSelectedSluzbenikIme(found.imePrezime);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Neraspoređeno / U mom osobnom radu —</option>
                    {sluzbenici.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.imePrezime} {s.radnoMjesto ? `— ${s.radnoMjesto}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Datum dodjele u rad
                    </label>
                    <input
                      type="date"
                      value={datumDodjele}
                      onChange={(e) => setDatumDodjele(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      Interni rok za nacrt (opcijski)
                    </label>
                    <input
                      type="date"
                      value={interniRok}
                      onChange={(e) => setInterniRok(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Uputa nadređenog službeniku za rad na predmetu (opcijski)
                  </label>
                  <textarea
                    rows={3}
                    value={uputaVoditelja}
                    onChange={(e) => setUputaVoditelja(e.target.value)}
                    placeholder="npr. Provjeriti je li žalba izjavljena u roku te prvo uputiti dopis za slanje žalbe na nadležni postupak (čl. 113. ZUP-a)..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Spremi zaduženje službenika</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Podnožje */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Zatvori
          </button>
        </div>
      </div>
    </div>
  );
}
