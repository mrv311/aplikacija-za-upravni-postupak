'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  uploadAndParseDocument,
  deleteDocument,
  updateDocumentMetaAndText,
  rerunDeepOcr,
  previewAnonymizedForPraksa,
  confirmPublishToPraksa,
} from '@/app/actions/documentActions';
import {
  META_DOC_TYPE,
  DOKUMENT_VRSTE,
  PREDMET_PODRUCJA,
  PREDMET_ISHODI,
  decodeDocLabel,
  guessDocRoleFromFilename,
  formatBytes,
  type PredmetPodrucje,
  type PredmetIshod,
} from '@/lib/predmet-meta';
import {
  Upload,
  FileText,
  Eye,
  Trash2,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Landmark,
  ScanLine,
  PenLine,
  ShieldCheck,
} from 'lucide-react';

type DokumentRow = {
  id: string;
  tip_dokumenta: string;
  storage_url: string;
  raw_text?: string;
};

type QueuedUploadFile = {
  uid: string;
  file: File;
  vrsta: string;
};

function getRoleBadgeStyle(vrsta: string): string {
  const v = vrsta.toLowerCase();
  if (v.includes('žalba')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (v.includes('drugostup')) return 'bg-purple-50 text-purple-700 border-purple-200';
  if (v.includes('prvostup') || v.includes('rješenje'))
    return 'bg-blue-50 text-blue-700 border-blue-200';
  if (v.includes('dostavn')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (v.includes('punomo')) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (v.includes('popratn')) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function DocumentManager({
  predmetId,
  defaultPodrucje = 'NUV',
  defaultIshod = 'Odbijena žalba',
}: {
  predmetId: string;
  defaultPodrucje?: PredmetPodrucje;
  defaultIshod?: PredmetIshod;
}) {
  const router = useRouter();
  const [dokumenti, setDokumenti] = useState<DokumentRow[]>([]);
  const [queuedFiles, setQueuedFiles] = useState<QueuedUploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  // Preglednik "Sken ↔ Pročitani OCR tekst"
  const [inspectingDoc, setInspectingDoc] = useState<DokumentRow | null>(null);
  const [editVrsta, setEditVrsta] = useState('');
  const [editRawText, setEditRawText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [rerunningOcr, setRerunningOcr] = useState(false);

  // Modal za brisanje pojedinog dokumenta
  const [deletingDoc, setDeletingDoc] = useState<DokumentRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Modal: Anonimiziraj i pošalji u Bazu prakse
  const [praksaModalDoc, setPraksaModalDoc] = useState<DokumentRow | null>(null);
  const [praksaPodrucje, setPraksaPodrucje] = useState<PredmetPodrucje>(defaultPodrucje);
  const [praksaIshod, setPraksaIshod] = useState<PredmetIshod>(defaultIshod);
  const [praksaGodina, setPraksaGodina] = useState(new Date().getFullYear().toString());
  const [praksaStep, setPraksaStep] = useState<'config' | 'preview'>('config');
  const [praksaBusy, setPraksaBusy] = useState(false);
  const [praksaTitle, setPraksaTitle] = useState('');
  const [praksaText, setPraksaText] = useState('');
  const [praksaError, setPraksaError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDokumenti = useCallback(async () => {
    const { data, error } = await supabase
      .from('dokumenti')
      .select('id, tip_dokumenta, storage_url, raw_text')
      .eq('predmet_id', predmetId)
      .neq('tip_dokumenta', META_DOC_TYPE);

    if (data) {
      const realDocs = (data as DokumentRow[]).filter(
        (d) => !d.tip_dokumenta?.startsWith('__')
      );
      setDokumenti(realDocs);
    }
    if (error) console.error(error);
  }, [predmetId]);

  useEffect(() => {
    fetchDokumenti();
    const handleSync = () => fetchDokumenti();
    window.addEventListener('predmet-docs-updated', handleSync);
    return () => window.removeEventListener('predmet-docs-updated', handleSync);
  }, [fetchDokumenti]);

  const addFilesToQueue = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (arr.length === 0) return;

    const mapped: QueuedUploadFile[] = arr.map((f) => ({
      uid: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      vrsta: guessDocRoleFromFilename(f.name),
    }));

    setQueuedFiles((prev) => [...prev, ...mapped]);
    setFeedback(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  async function handleUploadQueue() {
    if (queuedFiles.length === 0 || isUploading) return;
    setIsUploading(true);
    setFeedback(null);

    let successCount = 0;
    let ocrCount = 0;

    try {
      for (let i = 0; i < queuedFiles.length; i++) {
        const item = queuedFiles[i];
        setUploadProgressText(
          `Čitam i spremam (${i + 1}/${queuedFiles.length}): ${item.file.name}...`
        );

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('predmetId', predmetId);
        formData.append('tipDokumenta', item.vrsta);

        const result = await uploadAndParseDocument(formData);
        if (result.error) {
          throw new Error(result.error);
        }
        successCount++;
        if (result.izvorTeksta === 'OCR sken') ocrCount++;
      }

      setQueuedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDokumenti();
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
      router.refresh();

      setFeedback({
        type: 'success',
        message:
          ocrCount > 0
            ? `Uspješno dodano ${successCount} dok. u spis (${ocrCount} pročitano putem AI OCR skena).`
            : `Uspješno dodano ${successCount} dok. u spis.`,
      });
    } catch (err: any) {
      console.error(err);
      setFeedback({
        type: 'error',
        message: err.message || 'Greška prilikom učitavanja dokumenata.',
      });
      await fetchDokumenti();
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
    }
  }

  const openInspector = (doc: DokumentRow) => {
    const parsed = decodeDocLabel(doc.tip_dokumenta);
    setInspectingDoc(doc);
    setEditVrsta(parsed.vrsta);
    setEditRawText(doc.raw_text || '');
  };

  const handleSaveDocChanges = async () => {
    if (!inspectingDoc) return;
    setSavingEdit(true);
    const res = await updateDocumentMetaAndText(inspectingDoc.id, {
      predmetId,
      vrsta: editVrsta,
      rawText: editRawText,
    });
    setSavingEdit(false);

    if (res.error) {
      alert(res.error);
      return;
    }

    await fetchDokumenti();
    window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
    setInspectingDoc((prev) =>
      prev
        ? {
            ...prev,
            tip_dokumenta: res.tip_dokumenta || prev.tip_dokumenta,
            raw_text: editRawText,
          }
        : null
    );
    setFeedback({
      type: 'success',
      message: 'Tekst i podaci dokumenta su spremljeni — AI asistent koristi ažurirani sadržaj.',
    });
  };

  const handleRerunDeepOcr = async () => {
    if (!inspectingDoc || rerunningOcr) return;
    setRerunningOcr(true);
    const res = await rerunDeepOcr(inspectingDoc.id, predmetId);
    setRerunningOcr(false);

    if (res.error) {
      alert(res.error);
      return;
    }

    if (res.rawText) {
      setEditRawText(res.rawText);
      await fetchDokumenti();
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
    }
  };

  const handleConfirmDeleteDoc = async () => {
    if (!deletingDoc) return;
    setDeletingBusy(true);
    const res = await deleteDocument(deletingDoc.id, deletingDoc.storage_url);
    setDeletingBusy(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setDeletingDoc(null);
      await fetchDokumenti();
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
      router.refresh();
      setFeedback({ type: 'success', message: 'Dokument je trajno uklonjen iz spisa i pohrane.' });
    }
  };

  const openPraksaPublisher = (doc: DokumentRow) => {
    setPraksaModalDoc(doc);
    setPraksaPodrucje(defaultPodrucje);
    setPraksaIshod(defaultIshod);
    setPraksaGodina(new Date().getFullYear().toString());
    setPraksaStep('config');
    setPraksaTitle('');
    setPraksaText('');
    setPraksaError(null);
  };

  const handleRunPraksaPreview = async () => {
    if (!praksaModalDoc) return;
    setPraksaBusy(true);
    setPraksaError(null);

    const res = await previewAnonymizedForPraksa({
      docId: praksaModalDoc.id,
      predmetId,
      podrucje: praksaPodrucje,
      ishod: praksaIshod,
      godina: praksaGodina,
    });
    setPraksaBusy(false);

    if (res.error) {
      setPraksaError(res.error);
    } else {
      setPraksaTitle(res.proposedTitle || '');
      setPraksaText(res.anonymizedText || '');
      setPraksaStep('preview');
    }
  };

  const handleConfirmPublishPraksa = async () => {
    if (!praksaModalDoc) return;
    setPraksaBusy(true);
    setPraksaError(null);

    const res = await confirmPublishToPraksa({
      predmetId,
      nazivDatoteke: praksaTitle,
      anonymizedText: praksaText,
    });
    setPraksaBusy(false);

    if (res.error) {
      setPraksaError(res.error);
    } else {
      setPraksaModalDoc(null);
      router.refresh();
      setFeedback({
        type: 'success',
        message: `Konačno rješenje je GDPR anonimizirano i ugrađeno u RAG Bazu prakse (${res.chunkCount} vektorskih dijelova)!`,
      });
    }
  };

  const isPreviewableImage = (url: string) => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
  const isPreviewablePdf = (url: string) => /\.pdf(\?|$)/i.test(url);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* 1. DRAG & DROP ZONA ZA SKENOVE I DOKUMENTE */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`p-4 rounded-xl border-2 border-dashed transition-all ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/70'
            : 'border-slate-300 bg-slate-50/80 hover:border-blue-400 hover:bg-blue-50/30'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Povucite skenirane PDF-ove, slike ili Word akte u spis
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Podržano: PDF (uklj. skenove s AI OCR čitanjem), JPG/PNG skenovi, DOC i DOCX (do 30 MB)
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-800 transition-colors shrink-0 shadow-2xs cursor-pointer"
          >
            Odaberi datoteke...
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFilesToQueue(e.target.files);
            }}
          />
        </div>

        {/* Red čekanja odabranih datoteka prije slanja */}
        {queuedFiles.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Pripremljeno za učitavanje ({queuedFiles.length}):
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {queuedFiles.map((item) => (
                <div
                  key={item.uid}
                  className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="font-semibold text-slate-800 truncate">{item.file.name}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      ({formatBytes(item.file.size)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={item.vrsta}
                      disabled={isUploading}
                      onChange={(e) =>
                        setQueuedFiles((prev) =>
                          prev.map((q) =>
                            q.uid === item.uid ? { ...q, vrsta: e.target.value } : q
                          )
                        )
                      }
                      className="px-2 py-1 rounded border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                      {DOKUMENT_VRSTE.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() =>
                        setQueuedFiles((prev) => prev.filter((q) => q.uid !== item.uid))
                      }
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="Ukloni iz reda"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              {isUploading ? (
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadProgressText || 'Učitavam i čitam skenove...'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setQueuedFiles([])}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Očisti odabir
                </button>
              )}

              <button
                type="button"
                disabled={isUploading}
                onClick={handleUploadQueue}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors disabled:opacity-50"
              >
                {isUploading ? 'Obrađujem...' : `Učitaj u spis (${queuedFiles.length})`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status obavijest */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-semibold underline shrink-0"
          >
            OK
          </button>
        </div>
      )}

      {/* 2. POPIS DOKUMENATA U SPISU */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {dokumenti.length === 0 ? (
          <div className="py-12 text-center border border-slate-200/80 rounded-xl bg-slate-50/40">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">Spis je trenutno prazan</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Povucite prvostupanjsko rješenje, žalbu ili dostavnicu u gornji okvir.
            </p>
          </div>
        ) : (
          dokumenti.map((doc) => {
            const meta = decodeDocLabel(doc.tip_dokumenta);
            const charCount = (doc.raw_text || '').length;

            return (
              <div
                key={doc.id}
                className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-2xs transition-all space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(
                          meta.vrsta
                        )}`}
                      >
                        {meta.vrsta}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          meta.izvorTeksta === 'OCR sken'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : meta.izvorTeksta === 'Ručno uređeno'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {meta.izvorTeksta === 'OCR sken' ? (
                          <ScanLine className="w-2.5 h-2.5" />
                        ) : meta.izvorTeksta === 'Ručno uređeno' ? (
                          <PenLine className="w-2.5 h-2.5" />
                        ) : null}
                        {meta.izvorTeksta}
                      </span>

                      {meta.velicinaPrikaz && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {meta.velicinaPrikaz}
                        </span>
                      )}

                      <span className="text-[10px] text-slate-400 font-medium">
                        • {charCount.toLocaleString('hr-HR')} znakova
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-800 truncate">
                      {meta.izvorniNaziv || meta.vrsta}
                    </p>
                  </div>

                  {/* Akcijski gumbi dokumenta */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openInspector(doc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-xs font-semibold transition-colors"
                      title="Pregledaj izvorni sken usporedno s pročitanim OCR tekstom i po potrebi ispravi"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Sken & OCR
                    </button>

                    {(meta.vrsta.toLowerCase().includes('drugostup') ||
                      meta.vrsta.toLowerCase().includes('rješenje') ||
                      (doc.raw_text && doc.raw_text.toLowerCase().includes('obrazloženje'))) && (
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('trigger-ai-review', {
                              detail: { docText: doc.raw_text },
                            })
                          );
                          window.dispatchEvent(new CustomEvent('switch-to-ai-tab'));
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/90 text-xs font-semibold transition-colors cursor-pointer"
                        title="Pošalji ovaj nacrt na AI pravnu reviziju (kontrola odgovora na žalbu i zakonitosti)"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Pregled kod savjetnika
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openPraksaPublisher(doc)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-semibold transition-colors"
                      title="GDPR anonimiziraj ovaj akt i ugradi ga u Bazu prakse"
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      U praksu
                    </button>

                    <a
                      href={doc.storage_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      title="Otvori izvornu datoteku u novoj kartici"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={() => setDeletingDoc(doc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Obriši dokument iz spisa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {doc.raw_text && (
                  <p className="text-[11px] text-slate-500 line-clamp-2 bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-100 leading-snug">
                    {doc.raw_text.replace(/\s+/g, ' ').slice(0, 200)}...
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: PARALELNI PREGLED "IZVORNI SKEN ↔ PROČITANI OCR TEKST" */}
      {inspectingDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !savingEdit && !rerunningOcr && setInspectingDoc(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
          >
            {/* Zaglavlje preglednika */}
            <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-bold text-slate-900">
                  Pregled skena i pročitanog teksta
                </h3>
                <select
                  value={editVrsta}
                  onChange={(e) => setEditVrsta(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  {DOKUMENT_VRSTE.map((v) => (
                    <option key={v} value={v}>
                      Vrsta: {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={rerunningOcr || savingEdit}
                  onClick={handleRerunDeepOcr}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                  title="Ponovno pokreni dubinsko AI OCR čitanje izvorne datoteke"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${rerunningOcr ? 'animate-spin' : ''}`} />
                  {rerunningOcr ? 'Čitam sken...' : 'Ponovi AI OCR'}
                </button>

                <button
                  type="button"
                  disabled={savingEdit || rerunningOcr}
                  onClick={handleSaveDocChanges}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {savingEdit ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Spremi izmjene
                </button>

                <button
                  type="button"
                  onClick={() => setInspectingDoc(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Dvostupčani prikaz: Lijevo Sken, Desno Uredivi OCR tekst */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-0">
              {/* Lijevo: Izvorni PDF ili slika */}
              <div className="bg-slate-100 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 py-2 bg-slate-200/70 text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Izvorna datoteka u spisu</span>
                  <a
                    href={inspectingDoc.storage_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 hover:underline inline-flex items-center gap-1"
                  >
                    Otvori u novom prozoru <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex-1 overflow-auto flex items-center justify-center p-2">
                  {isPreviewableImage(inspectingDoc.storage_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inspectingDoc.storage_url}
                      alt="Sken dokumenta"
                      className="max-w-full h-auto rounded shadow"
                    />
                  ) : isPreviewablePdf(inspectingDoc.storage_url) ? (
                    <iframe
                      src={inspectingDoc.storage_url}
                      title="Pregled PDF skena"
                      className="w-full h-full rounded bg-white"
                    />
                  ) : (
                    <div className="text-center p-8 space-y-3">
                      <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                      <p className="text-sm text-slate-600">
                        Izravan prikaz u okviru dostupan je za PDF i slikovne skenove (Word datoteku možete preuzeti klikom iznad).
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Desno: Pročitani OCR tekst koji koristi AI Asistent */}
              <div className="flex flex-col min-h-0 bg-white">
                <div className="px-4 py-2 bg-blue-50/70 border-b border-blue-100 text-xs text-blue-900 flex items-center justify-between">
                  <span className="font-semibold">
                    Tekst koji čita AI Asistent (možete ručno popraviti npr. datum s pečata):
                  </span>
                  <span className="text-[11px] text-blue-700">
                    {editRawText.length.toLocaleString('hr-HR')} znakova
                  </span>
                </div>
                <textarea
                  value={editRawText}
                  onChange={(e) => setEditRawText(e.target.value)}
                  className="flex-1 w-full p-4 text-xs sm:text-sm font-mono text-slate-800 leading-relaxed focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: GDPR ANONIMIZACIJA I SLANJE U BAZU PRAKSE */}
      {praksaModalDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !praksaBusy && setPraksaModalDoc(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-200/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Landmark className="w-5 h-5 text-indigo-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    GDPR anonimizacija i ugradnja u Bazu prakse
                  </h3>
                  <p className="text-xs text-slate-600">
                    Pretvara imena u inicijale, uklanja OIB i adrese te vektorizira odluku za buduće AI pretrage
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPraksaModalDoc(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {praksaError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {praksaError}
                </div>
              )}

              {praksaStep === 'config' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Upravno područje
                      </label>
                      <select
                        value={praksaPodrucje}
                        onChange={(e) => setPraksaPodrucje(e.target.value as PredmetPodrucje)}
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
                        Ishod odluke
                      </label>
                      <select
                        value={praksaIshod}
                        onChange={(e) => setPraksaIshod(e.target.value as PredmetIshod)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        {PREDMET_ISHODI.map((ish) => (
                          <option key={ish.value} value={ish.value}>
                            {ish.value}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Godina odluke
                      </label>
                      <input
                        type="text"
                        value={praksaGodina}
                        onChange={(e) => setPraksaGodina(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                    U prvom koraku AI će anonimizirati sve osobne podatke (imena u inicijale, OIB u{' '}
                    <code>[OIB]</code>, ulice u <code>[Adresa]</code>) i prikazati vam tekst na
                    pregled prije trajnog spremanja u RAG bazu prakse.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Naziv pod kojim će odluka biti spremljena u Bazi prakse:
                    </label>
                    <input
                      type="text"
                      value={praksaTitle}
                      onChange={(e) => setPraksaTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Pregledajte GDPR anonimizirani tekst prije trajnog upisa:
                    </label>
                    <textarea
                      rows={13}
                      value={praksaText}
                      onChange={(e) => setPraksaText(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
              {praksaStep === 'preview' ? (
                <button
                  type="button"
                  disabled={praksaBusy}
                  onClick={() => setPraksaStep('config')}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  ← Natrag
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={praksaBusy}
                  onClick={() => setPraksaModalDoc(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  Odustani
                </button>

                {praksaStep === 'config' ? (
                  <button
                    type="button"
                    disabled={praksaBusy}
                    onClick={handleRunPraksaPreview}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                  >
                    {praksaBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Anonimiziram...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        1. Anonimiziraj za pregled
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={praksaBusy}
                    onClick={handleConfirmPublishPraksa}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    {praksaBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Vektoriziram i spremam...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        2. Potvrdi upis u Bazu prakse
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: POTVRDA BRISANJA DOKUMENTA */}
      {deletingDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !deletingBusy && setDeletingDoc(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-200">
              <h3 className="text-base font-bold text-slate-900">Ukloni dokument iz spisa?</h3>
            </div>
            <div className="p-6 text-sm text-slate-700">
              Dokument{' '}
              <strong>
                {decodeDocLabel(deletingDoc.tip_dokumenta).izvorniNaziv ||
                  decodeDocLabel(deletingDoc.tip_dokumenta).vrsta}
              </strong>{' '}
              bit će trajno obrisan iz ovog predmeta i iz pohrane datoteka.
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={handleConfirmDeleteDoc}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {deletingBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Obriši dokument
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
