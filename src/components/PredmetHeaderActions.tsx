'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Trash2,
  Clock,
  Landmark,
  X,
  Loader2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { DraftGeneratorModal } from '@/components/DraftGeneratorModal';
import {
  archivePredmet,
  unarchivePredmet,
  updatePredmet,
  updatePredmetFaza,
  deletePredmet,
} from '@/app/actions/predmetActions';
import {
  type EnrichedPredmet,
  type PredmetFaza,
  type PredmetIshod,
  type PredmetPodrucje,
  PREDMET_PODRUCJA,
  PREDMET_FAZE,
  PREDMET_ISHODI,
  calculateZupDeadline,
} from '@/lib/predmet-meta';
import { getStatusBadge } from '@/components/StatusBadge';

export function PredmetHeaderActions({ predmet }: { predmet: EnrichedPredmet }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [faza, setFaza] = useState<PredmetFaza>(predmet.faza);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit polja
  const [klasa, setKlasa] = useState(predmet.klasa);
  const [urbroj, setUrbroj] = useState(predmet.urbroj);
  const [stranka, setStranka] = useState(predmet.stranka);
  const [podrucje, setPodrucje] = useState<PredmetPodrucje>(predmet.podrucje);
  const [datumZaprimanja, setDatumZaprimanja] = useState(predmet.datum_zaprimanja);
  const [napomena, setNapomena] = useState(predmet.napomena || '');
  const [ishod, setIshod] = useState<PredmetIshod>(predmet.ishod || 'Odbijena žalba');

  const isArchived = predmet.status === 'arhiviran';
  const deadline = !isArchived ? calculateZupDeadline(predmet.datum_zaprimanja) : null;
  const fazaMeta = PREDMET_FAZE.find((f) => f.value === faza) || PREDMET_FAZE[0];
  const ishodMeta = PREDMET_ISHODI.find((i) => i.value === predmet.ishod);

  const handleFazaChange = async (novaFaza: PredmetFaza) => {
    setFaza(novaFaza);
    const res = await updatePredmetFaza(predmet.id, novaFaza);
    if (!res.error) {
      startTransition(() => router.refresh());
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    const res = await updatePredmet(predmet.id, {
      klasa,
      urbroj,
      stranka,
      datum_zaprimanja: datumZaprimanja,
      podrucje,
      faza,
      ishod: isArchived ? ishod : predmet.ishod,
      napomena,
    });
    setBusy(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setEditOpen(false);
      startTransition(() => router.refresh());
    }
  };

  const handleConfirmArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    const res = await archivePredmet(predmet.id, {
      ishod,
      napomena,
    });
    setBusy(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setArchiveOpen(false);
      startTransition(() => router.refresh());
    }
  };

  const handleUnarchive = async () => {
    setBusy(true);
    const res = await unarchivePredmet(predmet.id);
    setBusy(false);
    if (!res.error) {
      startTransition(() => router.refresh());
    } else {
      alert(res.error);
    }
  };

  const handleConfirmDelete = async () => {
    setBusy(true);
    const res = await deletePredmet(predmet.id);
    setBusy(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      router.push(isArchived ? '/arhiva' : '/');
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Status & Područje */}
        {getStatusBadge(predmet.status)}

        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {predmet.podrucje}
        </span>

        {predmet.poslano_u_praksu && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Landmark className="w-3 h-3" />
            U Bazi prakse
          </span>
        )}

        {/* ZUP rok ili Ishod */}
        {!isArchived && deadline && (
          <span
            title={`Zakonski rok (60 dana, čl. 121. ZUP-a) istječe: ${deadline.deadlineDateFormatted}`}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
              deadline.urgency === 'overdue'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : deadline.urgency === 'warning'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {deadline.label}
          </span>
        )}

        {isArchived && predmet.ishod && (
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
              ishodMeta ? ishodMeta.badgeClass : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {predmet.ishod}
          </span>
        )}

        {/* Brza promjena faze ako je aktivan */}
        {!isArchived && (
          <select
            value={faza}
            onChange={(e) => handleFazaChange(e.target.value as PredmetFaza)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${fazaMeta.badgeClass}`}
          >
            {PREDMET_FAZE.map((f) => (
              <option key={f.value} value={f.value} className="bg-white text-slate-800">
                {f.label}
              </option>
            ))}
          </select>
        )}

        <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

        {/* Akcijski gumbi u zaglavlju spisa */}
        <button
          type="button"
          onClick={() => setDraftModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          title="Generiraj tekst drugostupanjskog akta (Uvod, Izreka, Obrazloženje temeljem spisa i prakse)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Generiraj nacrt</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setEditOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5 text-slate-500" />
          Uredi
        </button>

        {!isArchived ? (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setArchiveOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-800 transition-colors"
          >
            <Archive className="w-3.5 h-3.5 text-amber-600" />
            Arhiviraj (A/A)
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleUnarchive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 transition-colors"
          >
            <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600" />
            Vrati u aktivne
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setDeleteOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200/80 bg-white hover:bg-rose-50 text-xs font-semibold text-rose-600 transition-colors"
          title="Trajno obriši cijeli predmet i njegove dokumente"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Obriši
        </button>
      </div>

      {/* Modal: Uredi predmet */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !busy && setEditOpen(false)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Uredi podatke predmeta</h3>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">KLASA *</label>
                  <input
                    type="text"
                    required
                    value={klasa}
                    onChange={(e) => setKlasa(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    URBROJ (po izradi akta - opcijski)
                  </label>
                  <input
                    type="text"
                    placeholder="Upisuje se po kreiranju akta"
                    value={urbroj}
                    onChange={(e) => setUrbroj(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Stranka / Žalitelj *
                </label>
                <input
                  type="text"
                  required
                  value={stranka}
                  onChange={(e) => setStranka(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Područje
                  </label>
                  <select
                    value={podrucje}
                    onChange={(e) => setPodrucje(e.target.value as PredmetPodrucje)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {PREDMET_PODRUCJA.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.fullLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Datum primitka
                  </label>
                  <input
                    type="date"
                    value={datumZaprimanja}
                    onChange={(e) => setDatumZaprimanja(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Interna bilješka
                </label>
                <input
                  type="text"
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="Kratka napomena o spisu..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                {busy ? 'Spremam...' : 'Spremi izmjene'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Arhiviraj predmet (A/A) */}
      {archiveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !busy && setArchiveOpen(false)}
        >
          <form
            onSubmit={handleConfirmArchive}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Arhiviraj spis (A/A)</h3>
              </div>
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Ishod rješavanja predmeta
                </label>
                <select
                  value={ishod}
                  onChange={(e) => setIshod(e.target.value as PredmetIshod)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  {PREDMET_ISHODI.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Završna bilješka (opcijski)
                </label>
                <input
                  type="text"
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="npr. Rješenje otpremljeno stranci"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Spremi u Arhivu (A/A)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Trajno brisanje predmeta */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !busy && setDeleteOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="text-base font-bold text-slate-900">Trajno obriši predmet?</h3>
            </div>

            <div className="p-6 space-y-3 text-sm text-slate-700">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {errorMsg}
                </div>
              )}
              <p>
                Predmet <strong>{predmet.klasa}</strong> ({predmet.stranka}) i svi njegovi priloženi
                skenovi ({predmet.broj_dokumenata} dok.) bit će trajno uklonjeni iz baze i pohrane.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Da, trajno obriši
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generator nacrta akta i obrazloženja (Točka 3) */}
      <DraftGeneratorModal
        predmetId={predmet.id}
        klasa={predmet.klasa}
        stranka={predmet.stranka}
        isOpen={draftModalOpen}
        onClose={() => setDraftModalOpen(false)}
        onDraftSavedToCase={() => {
          startTransition(() => router.refresh());
        }}
      />
    </>
  );
}
