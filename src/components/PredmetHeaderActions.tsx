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
  ShieldCheck,
  PenTool,
  CheckCheck,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DraftGeneratorModal } from '@/components/DraftGeneratorModal';
import { LegalReviewModal } from '@/components/LegalReviewModal';
import {
  archivePredmet,
  unarchivePredmet,
  updatePredmet,
  updatePredmetFaza,
  deletePredmet,
  sendPredmetToSigning,
  returnPredmetToWork,
  smartCompleteAndArchivePredmet,
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
  decodeDocLabel,
} from '@/lib/predmet-meta';
import { getStatusBadge } from '@/components/StatusBadge';

export function PredmetHeaderActions({ predmet }: { predmet: EnrichedPredmet }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [faza, setFaza] = useState<PredmetFaza>(predmet.faza);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
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

  // Smart arhiviranje i objava u Bazu prakse
  const [availableDocs, setAvailableDocs] = useState<
    Array<{ id: string; tip_dokumenta: string; raw_text?: string }>
  >([]);
  const [selectedPublishDocId, setSelectedPublishDocId] = useState<string>('');
  const [autoPublishToPraksa, setAutoPublishToPraksa] = useState(true);
  const [datumRjesavanja, setDatumRjesavanja] = useState<string>(
    predmet.datum_rjesavanja || new Date().toISOString().split('T')[0]
  );
  const [successToast, setSuccessToast] = useState<string | null>(null);

  React.useEffect(() => {
    const handleOpenReview = () => setReviewModalOpen(true);
    window.addEventListener('trigger-ai-review', handleOpenReview);
    return () => window.removeEventListener('trigger-ai-review', handleOpenReview);
  }, []);

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

  const handleSendToSigning = async () => {
    setBusy(true);
    const res = await sendPredmetToSigning(predmet.id);
    setBusy(false);
    if (!res.error) {
      setFaza('Na potpisu');
      setSuccessToast('Nacrt rješenja uspješno je označen gotovim i upućen na potpis!');
      setTimeout(() => setSuccessToast(null), 4000);
      startTransition(() => router.refresh());
    } else {
      alert(res.error);
    }
  };

  const handleReturnToWork = async () => {
    setBusy(true);
    const res = await returnPredmetToWork(predmet.id);
    setBusy(false);
    if (!res.error) {
      setFaza('U radu');
      setSuccessToast('Predmet je vraćen u fazu dorade i rada na spisu.');
      setTimeout(() => setSuccessToast(null), 4000);
      startTransition(() => router.refresh());
    } else {
      alert(res.error);
    }
  };

  const handleTriggerAiReview = () => {
    setReviewModalOpen(true);
  };

  const handleOpenSmartArchive = async () => {
    setErrorMsg(null);
    setArchiveOpen(true);
    try {
      const { data: docs } = await supabase
        .from('dokumenti')
        .select('id, tip_dokumenta, raw_text')
        .eq('predmet_id', predmet.id)
        .neq('tip_dokumenta', '__META__')
        .neq('tip_dokumenta', '__CHAT__');

      if (docs && docs.length > 0) {
        setAvailableDocs(docs);
        const rjesenjeDoc = docs.find(
          (d) =>
            d.tip_dokumenta.toLowerCase().includes('drugostup') ||
            d.tip_dokumenta.toLowerCase().includes('rješenje') ||
            (d.raw_text && d.raw_text.toLowerCase().includes('obrazloženje'))
        );
        if (rjesenjeDoc) {
          setSelectedPublishDocId(rjesenjeDoc.id);
          setAutoPublishToPraksa(true);

          const textLower = (rjesenjeDoc.raw_text || '').toLowerCase();
          if (textLower.includes('poništava se') || textLower.includes('uvažava se')) {
            setIshod('Poništeno rješenje');
          } else if (textLower.includes('odbacuje se')) {
            setIshod('Odbačena žalba');
          } else if (textLower.includes('odbija se')) {
            setIshod('Odbijena žalba');
          }
        } else {
          setAutoPublishToPraksa(false);
        }
      }
    } catch (err) {
      console.error(err);
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
    const res = await smartCompleteAndArchivePredmet(predmet.id, {
      ishod,
      datum_rjesavanja: datumRjesavanja,
      napomena,
      publishDocId: autoPublishToPraksa && selectedPublishDocId ? selectedPublishDocId : undefined,
    });
    setBusy(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setArchiveOpen(false);
      if (res.praksaPublished) {
        setSuccessToast('Spis je arhiviran, a odluka uspješno objavljena u Bazi prakse!');
      } else {
        setSuccessToast('Spis je uspješno dovršen i arhiviran (A/A).');
      }
      setTimeout(() => setSuccessToast(null), 4000);
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
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Status & Područje */}
        {getStatusBadge(predmet.status)}

        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {predmet.podrucje}
        </span>

        {predmet.poslano_u_praksu && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
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
              <option key={f.value} value={f.value} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                {f.label}
              </option>
            ))}
          </select>
        )}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

        {/* VOĐENI TIJEK AKTA (Pametni workflow) */}
        {!isArchived && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Gumb 1: AI Pravna revizija nacrta */}
            <button
              type="button"
              onClick={handleTriggerAiReview}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Pokreni AI pravnu reviziju nacrta rješenja kod savjetnika (kontrola odgovora na žalbu i zakonitosti)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Pregledaj kod savjetnika</span>
            </button>

            {/* Gumb 2: Glavna akcija faze */}
            {faza !== 'Na potpisu' ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleSendToSigning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                title="Dovrši nacrt i pošalji ga na potpis ovlaštenoj osobi"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Pošalji na potpis</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleOpenSmartArchive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer animate-pulse"
                  title="Rješenje je potpisano i otpremljeno stranci — dovrši predmet i arhiviraj"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Potpisano & Otpremi (Riješi)</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReturnToWork}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Vrati predmet u doradu ako potpisnik traži izmjene"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden xl:inline">Vrati u rad</span>
                </button>
              </>
            )}
          </div>
        )}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

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
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5 text-slate-500" />
          Uredi
        </button>

        {!isArchived ? (
          faza !== 'Na potpisu' && (
            <button
              type="button"
              onClick={handleOpenSmartArchive}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
              title="Ručno arhiviranje spisa"
            >
              <Archive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Arhiviraj (A/A)
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleUnarchive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition-colors"
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
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-colors"
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

      {/* Modal: Pametno rješavanje i arhiviranje (A/A) + Slanje u praksu */}
      {archiveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !busy && setArchiveOpen(false)}
        >
          <form
            onSubmit={handleConfirmArchive}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200/80 dark:border-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                    Dovrši predmet i arhiviraj (A/A)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Potpisano drugostupanjsko rješenje i službeno zatvaranje spisa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Ishod postupka *
                  </label>
                  <select
                    value={ishod}
                    onChange={(e) => setIshod(e.target.value as PredmetIshod)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    {PREDMET_ISHODI.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Datum rješavanja / otpreme *
                  </label>
                  <input
                    type="date"
                    required
                    value={datumRjesavanja}
                    onChange={(e) => setDatumRjesavanja(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* AUTOMATSKO SLANJE U BAZU PRAKSE */}
              <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPublishToPraksa}
                    onChange={(e) => setAutoPublishToPraksa(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Automatski anonimiziraj i dodaj rješenje u Bazu prakse
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      AI će ukloniti osobne podatke (OIB, ime, adresa) prema GDPR-u i uvrstiti ogledni primjerak u bazu za buduće pretrage i slične predmete.
                    </p>
                  </div>
                </label>

                {autoPublishToPraksa && availableDocs.length > 0 && (
                  <div className="pt-2 border-t border-blue-200/70 dark:border-blue-800/70">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Dokument za objavu u praksi:
                    </label>
                    <select
                      value={selectedPublishDocId}
                      onChange={(e) => setSelectedPublishDocId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      {availableDocs.map((d) => {
                        const parsed = decodeDocLabel(d.tip_dokumenta);
                        return (
                          <option key={d.id} value={d.id}>
                            {parsed.vrsta} {parsed.izvorniNaziv ? `— ${parsed.izvorniNaziv}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Završna bilješka (opcijski)
                </label>
                <input
                  type="text"
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="npr. Rješenje potpisano i otpremljeno poštom stranci"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setArchiveOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rješavam i arhiviram...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Potvrdi rješavanje i arhiviraj</span>
                  </>
                )}
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

      {/* Modal: AI Pregled i revizija završenog rješenja kod savjetnika */}
      <LegalReviewModal
        predmetId={predmet.id}
        klasa={predmet.klasa}
        stranka={predmet.stranka}
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onActSavedToCase={() => {
          startTransition(() => router.refresh());
        }}
      />
    </>
  );
}
