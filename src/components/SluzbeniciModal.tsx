'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  UserCheck,
  Stamp,
  Briefcase,
} from 'lucide-react';
import {
  getInitials,
  type Sluzbenik,
  type EnrichedPredmet,
} from '@/lib/predmet-meta';
import {
  getSluzbeniciAction,
  saveSluzbeniciAction,
} from '@/app/actions/predmetActions';

interface SluzbeniciModalProps {
  isOpen: boolean;
  onClose: () => void;
  predmeti?: EnrichedPredmet[];
  onUpdated?: (updated: Sluzbenik[]) => void;
}

export function SluzbeniciModal({
  isOpen,
  onClose,
  predmeti = [],
  onUpdated,
}: SluzbeniciModalProps) {
  const [sluzbenici, setSluzbenici] = useState<Sluzbenik[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Novi službenik polja
  const [novoIme, setNovoIme] = useState('');
  const [novoRadnoMjesto, setNovoRadnoMjesto] = useState('Viši upravni savjetnik');
  const [noviInicijali, setNoviInicijali] = useState('');

  // Uređivanje postojećeg službenika
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIme, setEditIme] = useState('');
  const [editRadnoMjesto, setEditRadnoMjesto] = useState('');
  const [editInicijali, setEditInicijali] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getSluzbeniciAction()
      .then((list) => {
        setSluzbenici(list);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const persistList = async (nextList: Sluzbenik[]) => {
    setSaving(true);
    setSluzbenici(nextList);
    try {
      const res = await saveSluzbeniciAction(nextList);
      if (res.sluzbenici) {
        setSluzbenici(res.sluzbenici);
        onUpdated?.(res.sluzbenici);
        window.dispatchEvent(
          new CustomEvent('sluzbenici-updated', { detail: res.sluzbenici })
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoIme.trim()) return;

    const newEntry: Sluzbenik = {
      id: `sl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      imePrezime: novoIme.trim(),
      radnoMjesto: novoRadnoMjesto.trim(),
      inicijali: (noviInicijali.trim() || getInitials(novoIme)).toUpperCase(),
      aktivan: true,
    };

    const next = [...sluzbenici, newEntry];
    setNovoIme('');
    setNoviInicijali('');
    await persistList(next);
  };

  const startEdit = (s: Sluzbenik) => {
    setEditingId(s.id);
    setEditIme(s.imePrezime);
    setEditRadnoMjesto(s.radnoMjesto || '');
    setEditInicijali(s.inicijali || getInitials(s.imePrezime));
  };

  const saveEdit = async (id: string) => {
    if (!editIme.trim()) return;
    const next = sluzbenici.map((s) =>
      s.id === id
        ? {
            ...s,
            imePrezime: editIme.trim(),
            radnoMjesto: editRadnoMjesto.trim(),
            inicijali: (editInicijali.trim() || getInitials(editIme)).toUpperCase(),
          }
        : s
    );
    setEditingId(null);
    await persistList(next);
  };

  const handleDelete = async (id: string) => {
    const next = sluzbenici.filter((s) => s.id !== id);
    await persistList(next);
  };

  // Izračun statistike po službeniku iz aktivnih/arhiviranih predmeta
  const getStatsForOfficial = (s: Sluzbenik) => {
    let aktivniCount = 0;
    let parafiCount = 0;
    const imeNorm = s.imePrezime.toLowerCase().trim();

    for (const p of predmeti) {
      const assignedMatch =
        p.sluzbenik_id === s.id ||
        (p.sluzbenik_ime && p.sluzbenik_ime.toLowerCase().trim() === imeNorm);

      if (assignedMatch && p.status === 'aktivan') {
        aktivniCount++;
      }

      if (Array.isArray(p.parafi)) {
        for (const pf of p.parafi) {
          const pfSluzbenik = (pf.sluzbenik_ime || p.sluzbenik_ime || '')
            .toLowerCase()
            .trim();
          if (pfSluzbenik === imeNorm || (assignedMatch && !pf.sluzbenik_ime)) {
            if (pf.status === 'Parafirano' || pf.status === 'Parafirano uz izmjene') {
              parafiCount++;
            }
          }
        }
      }
    }

    return { aktivniCount, parafiCount };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Zaglavlje */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Upravljanje popisom službenika
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dodajte ili uredite službenike kojima delegirate predmete u rad i parafirate akte
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Forma za dodavanje novog službenika */}
          <form
            onSubmit={handleAdd}
            className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/25 border border-blue-200/80 dark:border-blue-900/60 space-y-3"
          >
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Dodaj novog službenika u evidenciju
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-5">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Ime i prezime (i stručni naziv) *
                </label>
                <input
                  type="text"
                  required
                  value={novoIme}
                  onChange={(e) => {
                    setNovoIme(e.target.value);
                    if (!noviInicijali) {
                      // Inicijali se automatski računaju ako nisu ručno uneseni
                    }
                  }}
                  placeholder="npr. Ana Horvat, dipl. iur."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Radno mjesto / zvanje
                </label>
                <input
                  type="text"
                  value={novoRadnoMjesto}
                  onChange={(e) => setNovoRadnoMjesto(e.target.value)}
                  placeholder="npr. Viši upravni savjetnik"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-3 flex items-end gap-2">
                <div className="w-16 shrink-0">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Inicijali
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={noviInicijali || (novoIme ? getInitials(novoIme) : '')}
                    onChange={(e) => setNoviInicijali(e.target.value.toUpperCase())}
                    placeholder="AH"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-center text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving || !novoIme.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer h-[34px]"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Dodaj</span>
                </button>
              </div>
            </div>
          </form>

          {/* Popis službenika */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Evidentirani službenici ({sluzbenici.length})
              </h4>
              {saving && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Spremam promjene...
                </span>
              )}
            </div>

            {loading ? (
              <div className="py-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Učitavam popis službenika...
              </div>
            ) : sluzbenici.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Popis službenika je trenutno prazan
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Unesite ime i prezime službenika u polje iznad kako biste im mogli delegirati predmete i evidentirati parafe.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {sluzbenici.map((s) => {
                  const isEditing = editingId === s.id;
                  const stats = getStatsForOfficial(s);

                  return (
                    <div
                      key={s.id}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {isEditing ? (
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <input
                            type="text"
                            value={editIme}
                            onChange={(e) => setEditIme(e.target.value)}
                            className="sm:col-span-5 px-2.5 py-1.5 rounded-lg border border-blue-400 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100"
                            placeholder="Ime i prezime"
                          />
                          <input
                            type="text"
                            value={editRadnoMjesto}
                            onChange={(e) => setEditRadnoMjesto(e.target.value)}
                            className="sm:col-span-4 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
                            placeholder="Radno mjesto"
                          />
                          <input
                            type="text"
                            maxLength={4}
                            value={editInicijali}
                            onChange={(e) => setEditInicijali(e.target.value.toUpperCase())}
                            className="sm:col-span-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center uppercase"
                          />
                          <div className="sm:col-span-2 flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(s.id)}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Spremi"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                              title="Odustani"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                              {s.inicijali || getInitials(s.imePrezime)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                {s.imePrezime}
                              </p>
                              {s.radnoMjesto && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                                  <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                                  {s.radnoMjesto}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              title="Broj aktivnih predmeta delegiranih ovom službeniku"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                            >
                              <UserCheck className="w-3 h-3" />
                              {stats.aktivniCount} u radu
                            </span>

                            <span
                              title="Ukupno parafiranih akata ovog službenika"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            >
                              <Stamp className="w-3 h-3" />
                              {stats.parafiCount} parafa
                            </span>

                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Uredi službenika"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(s.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Ukloni službenika s popisa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Podnožje */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Promjene se automatski spremaju i odmah su dostupne kod delegiranja i parafiranja.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Zatvori
          </button>
        </div>
      </div>
    </div>
  );
}
