'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Sparkles,
  Upload,
  FileText,
  X,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Stamp,
  Trash2,
} from 'lucide-react';
import {
  createPredmet,
  extractCaseInfoFromScan,
} from '@/app/actions/predmetActions';
import { uploadAndParseDocument } from '@/app/actions/documentActions';
import {
  PREDMET_PODRUCJA,
  DOKUMENT_VRSTE,
  guessDocRoleFromFilename,
  formatBytes,
  type PredmetPodrucje,
} from '@/lib/predmet-meta';

interface QueuedCaseFile {
  uid: string;
  file: File;
  docType: string;
}

export default function NewPredmetButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [extractingUid, setExtractingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [scanSuccessMsg, setScanSuccessMsg] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const [klasa, setKlasa] = useState('');
  const [stranka, setStranka] = useState('');
  const [podrucje, setPodrucje] = useState<PredmetPodrucje>('NUV');
  const [datumPrimitka, setDatumPrimitka] = useState(today);
  const [datumIzvor, setDatumIzvor] = useState<string>('');
  const [napomena, setNapomena] = useState('');

  const [queuedFiles, setQueuedFiles] = useState<QueuedCaseFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setKlasa('');
    setStranka('');
    setPodrucje('NUV');
    setDatumPrimitka(today);
    setDatumIzvor('');
    setNapomena('');
    setQueuedFiles([]);
    setErrorMsg('');
    setScanSuccessMsg('');
    setExtractingUid(null);
    setUploadProgressText('');
    setLoading(false);
  };

  const closeModal = () => {
    if (loading) return;
    setIsOpen(false);
    resetForm();
  };

  const runScanExtractionOnItem = async (target: QueuedCaseFile) => {
    setErrorMsg('');
    setScanSuccessMsg('');
    setExtractingUid(target.uid);

    try {
      const fd = new FormData();
      fd.append('file', target.file);
      const res = await extractCaseInfoFromScan(fd);

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.extracted) {
        if (res.extracted.klasa) setKlasa(res.extracted.klasa);
        if (res.extracted.stranka) setStranka(res.extracted.stranka);
        if (res.extracted.datumZaprimanja) {
          setDatumPrimitka(res.extracted.datumZaprimanja);
          setDatumIzvor(res.extracted.izvorDatuma || 'prijamni štambilj');
        }
        if (res.extracted.podrucje) setPodrucje(res.extracted.podrucje);
        if (res.extracted.vrstaDokumenta) {
          setQueuedFiles((prev) =>
            prev.map((q) =>
              q.uid === target.uid ? { ...q, docType: res.extracted!.vrstaDokumenta } : q
            )
          );
        }
        if (res.extracted.napomena && !napomena) {
          setNapomena(res.extracted.napomena);
        }

        const dateNote = res.extracted.datumZaprimanja
          ? ` (datum primitka: ${new Date(res.extracted.datumZaprimanja).toLocaleDateString('hr-HR')}${
              res.extracted.izvorDatuma ? ` — ${res.extracted.izvorDatuma}` : ''
            })`
          : '';
        setScanSuccessMsg(
          `AI je pročitao dokument „${target.file.name}”${dateNote} i popunio polja predmeta.`
        );
      }
    } catch {
      setErrorMsg('Greška pri automatskom čitanju skena. Podatke možete unijeti ručno.');
    } finally {
      setExtractingUid(null);
    }
  };

  const handleFilesAdded = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: QueuedCaseFile[] = Array.from(fileList).map((f, idx) => ({
      uid: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      docType: guessDocRoleFromFilename(f.name),
    }));

    const wasEmpty = queuedFiles.length === 0;
    setQueuedFiles((prev) => [...prev, ...newItems]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Ako prvi put dodajemo datoteke (ili ako KLASA/Stranka još nisu popunjeni),
    // automatski pokreni AI čitanje na najboljem dokumentu (prednost: Popratni dopis I. stupnja -> Žalba -> prvi dokument)
    if (wasEmpty || (!klasa.trim() && !stranka.trim())) {
      const bestCandidate =
        newItems.find((item) => item.docType === 'Popratni dopis I. stupnja') ||
        newItems.find((item) => item.docType === 'Žalba') ||
        newItems[0];

      if (bestCandidate) {
        await runScanExtractionOnItem(bestCandidate);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const removeQueuedFile = (uid: string) => {
    setQueuedFiles((prev) => prev.filter((item) => item.uid !== uid));
  };

  const updateQueuedFileDocType = (uid: string, docType: string) => {
    setQueuedFiles((prev) =>
      prev.map((item) => (item.uid === uid ? { ...item, docType } : item))
    );
  };

  const submitCase = async (openImmediately: boolean) => {
    if (!klasa.trim() || !stranka.trim() || !datumPrimitka) {
      setErrorMsg('Molimo ispunite KLASU, Stranku i Datum zaprimanja.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setUploadProgressText('Otvaram novi predmet...');

    const formData = new FormData();
    formData.append('klasa', klasa.trim());
    formData.append('stranka', stranka.trim());
    formData.append('datum_primitka', datumPrimitka);
    formData.append('podrucje', podrucje);
    formData.append('napomena', napomena.trim());

    const result = await createPredmet(formData);

    if (result.error || !result.data) {
      setErrorMsg(result.error || 'Greška pri kreiranju predmeta.');
      setLoading(false);
      setUploadProgressText('');
      return;
    }

    const createdId = result.data.id;

    // Učitaj sve priložene PDF-ove / skenove u novootvoreni spis
    if (queuedFiles.length > 0) {
      for (let i = 0; i < queuedFiles.length; i++) {
        const item = queuedFiles[i];
        setUploadProgressText(
          `Učitavam u spis (${i + 1}/${queuedFiles.length}): ${item.file.name}...`
        );
        const docForm = new FormData();
        docForm.append('file', item.file);
        docForm.append('predmetId', createdId);
        docForm.append('tipDokumenta', item.docType);
        await uploadAndParseDocument(docForm);
      }
    }

    setLoading(false);
    setUploadProgressText('');
    setIsOpen(false);
    resetForm();

    if (openImmediately && createdId) {
      router.push(`/predmeti/${createdId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Novi predmet
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Zaglavlje modala */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Novi upravni predmet</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Povucite jedan ili više PDF-ova (npr. popratni dopis Hrvatskih voda, žalbu, rješenje)
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* Višestruka Drag & Drop zona za jedan ili više PDF-ova / skenova */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`p-4 rounded-xl border-2 border-dashed transition-all ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/75'
                    : 'border-blue-200 bg-blue-50/35 hover:bg-blue-50/55'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />

                {queuedFiles.length === 0 ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-700 shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Povucite popratni dopis ili sve dokumente spisa odjednom
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          AI će automatski pročitati <strong>KLASU</strong>, <strong>stranku</strong> i{' '}
                          <strong>datum s prijamnog štambilja</strong> te sve priložene PDF-ove spremiti u spis.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-semibold transition-colors shrink-0 shadow-2xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Odaberi PDF / skenove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-blue-200/60">
                      <span className="text-xs font-bold text-slate-800">
                        Priloženi dokumenti za spis ({queuedFiles.length})
                      </span>
                      <div className="flex items-center gap-2">
                        {extractingUid && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            AI čita prijamni štambilj i podatke...
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          Dodaj još PDF-ova
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {queuedFiles.map((item) => {
                        const isItemExtracting = extractingUid === item.uid;
                        return (
                          <div
                            key={item.uid}
                            className="flex flex-wrap items-center justify-between gap-2 bg-white/90 border border-slate-200/90 rounded-lg px-2.5 py-1.5"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span
                                className="text-xs font-semibold text-slate-800 truncate"
                                title={item.file.name}
                              >
                                {item.file.name}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                ({formatBytes(item.file.size)})
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <select
                                value={item.docType}
                                onChange={(e) => updateQueuedFileDocType(item.uid, e.target.value)}
                                className="text-[11px] bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {DOKUMENT_VRSTE.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                disabled={Boolean(extractingUid)}
                                onClick={() => runScanExtractionOnItem(item)}
                                title="Izvuci KLASU, stranku i datum štambilja iz ovog dokumenta"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-[10px] font-bold transition-colors disabled:opacity-50"
                              >
                                {isItemExtracting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3" />
                                )}
                                <span className="hidden sm:inline">Čitaj podatke</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => removeQueuedFile(item.uid)}
                                title="Ukloni dokument s popisa"
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {scanSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{scanSuccessMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Polja predmeta (bez URBROJ-a, jer ga Ministarstvo generira tek pri izradi akta) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1">
                  <label htmlFor="klasa" className="text-xs font-semibold text-slate-700">
                    KLASA *
                  </label>
                  <input
                    type="text"
                    id="klasa"
                    value={klasa}
                    onChange={(e) => setKlasa(e.target.value)}
                    placeholder="npr. UP/II-325-08/26-01/12"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-1">
                    <label
                      htmlFor="datum_primitka"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Datum zaprimanja (štambilj) *
                    </label>
                    {datumIzvor && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          datumIzvor.includes('štambilj')
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        <Stamp className="w-2.5 h-2.5" />
                        {datumIzvor}
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    id="datum_primitka"
                    value={datumPrimitka}
                    onChange={(e) => {
                      setDatumPrimitka(e.target.value);
                      setDatumIzvor('');
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <label htmlFor="stranka" className="text-xs font-semibold text-slate-700">
                    Stranka / Žalitelj *
                  </label>
                  <input
                    type="text"
                    id="stranka"
                    value={stranka}
                    onChange={(e) => setStranka(e.target.value)}
                    placeholder="Ime i prezime ili naziv pravne osobe"
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="podrucje" className="text-xs font-semibold text-slate-700">
                    Upravno područje
                  </label>
                  <select
                    id="podrucje"
                    value={podrucje}
                    onChange={(e) => setPodrucje(e.target.value as PredmetPodrucje)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PREDMET_PODRUCJA.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.fullLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="napomena" className="text-xs font-semibold text-slate-700">
                  Kratka interna bilješka (opcijski)
                </label>
                <input
                  type="text"
                  id="napomena"
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="npr. Dostavljen spis povodom žalbe — provjeriti pravodobnost"
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Donje akcije */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={closeModal}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Odustani
                </button>
                {loading && uploadProgressText && (
                  <span className="text-xs font-semibold text-blue-700 truncate max-w-56">
                    {uploadProgressText}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || Boolean(extractingUid)}
                  onClick={() => submitCase(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Spremanje...' : 'Spremi na listu'}
                </button>

                <button
                  type="button"
                  disabled={loading || Boolean(extractingUid)}
                  onClick={() => submitCase(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Otvaram...
                    </>
                  ) : (
                    <>
                      Spremi i otvori spis
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
