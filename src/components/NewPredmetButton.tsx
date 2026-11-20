'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  UserCheck,
  Users,
  Send,
} from 'lucide-react';
import {
  createPredmet,
  extractCaseInfoFromScan,
  getSluzbeniciAction,
} from '@/app/actions/predmetActions';
import { uploadAndParseDocument } from '@/app/actions/documentActions';
import {
  PREDMET_PODRUCJA,
  DOKUMENT_VRSTE,
  guessDocRoleFromFilename,
  isKosuljicaRole,
  isAmbiguousScanFilename,
  mergeKosuljicaNote,
  formatBytes,
  type NadlezniPostupakStatus,
  type PredmetPodrucje,
  type Sluzbenik,
} from '@/lib/predmet-meta';
import { SluzbeniciModal } from '@/components/SluzbeniciModal';

interface QueuedCaseFile {
  uid: string;
  file: File;
  docType: string;
  skipUpload?: boolean;
}

interface PendingScanJob {
  uid: string;
  speculativeKosuljica?: boolean;
  forceRescan?: boolean;
}

type DatumSourceRank = 0 | 1 | 2 | 3;

function getDatumSourceRank(izvor: string, isKosuljica: boolean): DatumSourceRank {
  if (!izvor) return 0;
  const low = izvor.toLowerCase();
  if (low.includes('naljepnic') || low.includes('štambilj')) {
    return isKosuljica ? 3 : 2;
  }
  return 1;
}

export default function NewPredmetButton({
  defaultNadlezniStatus = '',
}: {
  defaultNadlezniStatus?: NadlezniPostupakStatus;
}) {
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
  const [datumPredajeZalbe, setDatumPredajeZalbe] = useState('');
  const [datumPredajeZalbeIzvor, setDatumPredajeZalbeIzvor] = useState('');
  const [napomena, setNapomena] = useState('');
  const [hasHandwrittenNote, setHasHandwrittenNote] = useState(false);
  const [nadlezniStatus, setNadlezniStatus] = useState<NadlezniPostupakStatus>(defaultNadlezniStatus);
  const [nadlezniTijelo, setNadlezniTijelo] = useState('Hrvatske vode');
  const [nadlezniDatumSlanja, setNadlezniDatumSlanja] = useState(today);
  const [nadlezniNapomena, setNadlezniNapomena] = useState('');

  // Delegiranje predmeta službeniku
  const [sluzbenici, setSluzbenici] = useState<Sluzbenik[]>([]);
  const [sluzbenikId, setSluzbenikId] = useState('');
  const [sluzbenikIme, setSluzbenikIme] = useState('');
  const [interniRok, setInterniRok] = useState('');
  const [uputaVoditelja, setUputaVoditelja] = useState('');
  const [sluzbeniciModalOpen, setSluzbeniciModalOpen] = useState(false);

  const [queuedFiles, setQueuedFiles] = useState<QueuedCaseFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sinkrone reference za serijalizirani red AI čitanja i pouzdano spajanje više skenova bez gubitka zabilješki
  const queuedFilesRef = useRef<QueuedCaseFile[]>([]);
  const pendingScanQueueRef = useRef<PendingScanJob[]>([]);
  const isProcessingQueueRef = useRef(false);
  const scannedUidsRef = useRef<Set<string>>(new Set());
  const hasScannedKosuljicaRef = useRef(false);
  const hasScannedPopratniRef = useRef(false);
  const scanSessionIdRef = useRef(0);
  const scannedDocLabelsRef = useRef<Map<string, string>>(new Map());

  const createInitialScanContext = () => ({
    klasa: '',
    klasaFromKosuljica: false,
    stranka: '',
    datumPrimitka: today,
    datumIzvor: '',
    datumPrimitkaFromKosuljica: false,
    datumPredajeZalbe: '',
    podrucje: 'NUV' as PredmetPodrucje,
    podrucjeDetected: false,
    napomena: '',
    napomenaIsPureAutoSummary: false,
    hasAutoSummary: false,
    hasHandwrittenNote: false,
    nadlezniStatus: defaultNadlezniStatus,
  });

  const scanContextRef = useRef(createInitialScanContext());
  const userEditedFieldsRef = useRef<{
    klasa?: boolean;
    stranka?: boolean;
    datumPrimitka?: boolean;
    datumPredajeZalbe?: boolean;
    podrucje?: boolean;
    napomena?: boolean;
  }>({});

  useEffect(() => {
    if (isOpen) {
      getSluzbeniciAction().then(setSluzbenici);
    }
  }, [isOpen]);

  const resetForm = () => {
    scanSessionIdRef.current += 1;
    pendingScanQueueRef.current = [];
    isProcessingQueueRef.current = false;
    scannedUidsRef.current.clear();
    hasScannedKosuljicaRef.current = false;
    hasScannedPopratniRef.current = false;
    scannedDocLabelsRef.current.clear();
    queuedFilesRef.current = [];
    scanContextRef.current = createInitialScanContext();
    userEditedFieldsRef.current = {};

    setKlasa('');
    setStranka('');
    setPodrucje('NUV');
    setDatumPrimitka(today);
    setDatumIzvor('');
    setDatumPredajeZalbe('');
    setDatumPredajeZalbeIzvor('');
    setNapomena('');
    setHasHandwrittenNote(false);
    setNadlezniStatus(defaultNadlezniStatus);
    setNadlezniTijelo('Hrvatske vode');
    setNadlezniDatumSlanja(today);
    setNadlezniNapomena('');
    setSluzbenikId('');
    setSluzbenikIme('');
    setInterniRok('');
    setUputaVoditelja('');
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

  const processSingleScan = async (target: QueuedCaseFile, sessionId: number) => {
    setErrorMsg('');
    setExtractingUid(target.uid);

    try {
      const fd = new FormData();
      fd.append('file', target.file);
      const res = await extractCaseInfoFromScan(fd);

      if (scanSessionIdRef.current !== sessionId) return;

      if (res.error) {
        setErrorMsg(res.error);
        return;
      }

      const ext = res.extracted;
      if (!ext) return;

      const detectedRole = (ext.vrstaDokumenta || target.docType || '').trim();
      const isKosuljica = isKosuljicaRole(detectedRole) || isKosuljicaRole(target.file.name);
      if (isKosuljica) {
        hasScannedKosuljicaRef.current = true;
      }
      if (detectedRole === 'Popratni dopis I. stupnja') {
        hasScannedPopratniRef.current = true;
      }

      if (ext.vrstaDokumenta) {
        setQueuedFiles((prev) => {
          const next = prev.map((q) =>
            q.uid === target.uid
              ? {
                  ...q,
                  docType: detectedRole,
                  skipUpload: isKosuljica ? true : q.skipUpload,
                }
              : q
          );
          queuedFilesRef.current = next;
          return next;
        });
      }

      const ctx = scanContextRef.current;
      const edited = userEditedFieldsRef.current;

      if (ext.klasa && !edited.klasa) {
        const newIsUpII = /up\s*\/?\s*ii/i.test(ext.klasa);
        const currIsUpII = /up\s*\/?\s*ii/i.test(ctx.klasa);
        const shouldUpdateKlasa =
          !ctx.klasa.trim() ||
          (isKosuljica && !ctx.klasaFromKosuljica && (newIsUpII || !currIsUpII)) ||
          (newIsUpII && !currIsUpII);
        if (shouldUpdateKlasa) {
          ctx.klasa = ext.klasa;
          if (isKosuljica) ctx.klasaFromKosuljica = true;
          setKlasa(ext.klasa);
        }
      }

      if (ext.stranka && !edited.stranka && !ctx.stranka.trim()) {
        ctx.stranka = ext.stranka;
        setStranka(ext.stranka);
      }

      if (ext.datumZaprimanja && !edited.datumPrimitka) {
        const newIzvor = ext.izvorDatuma || 'prijamni štambilj';
        const currRank = getDatumSourceRank(ctx.datumIzvor, ctx.datumPrimitkaFromKosuljica);
        const newRank = getDatumSourceRank(newIzvor, isKosuljica);
        if (currRank === 0 || newRank > currRank) {
          ctx.datumPrimitka = ext.datumZaprimanja;
          ctx.datumIzvor = newIzvor;
          ctx.datumPrimitkaFromKosuljica = isKosuljica;
          setDatumPrimitka(ext.datumZaprimanja);
          setDatumIzvor(newIzvor);
        }
      }

      if (ext.datumPredajeZalbe && !edited.datumPredajeZalbe && !ctx.datumPredajeZalbe.trim()) {
        const zIzvor = ext.izvorDatumaZalbe || 'iz spisa';
        ctx.datumPredajeZalbe = ext.datumPredajeZalbe;
        setDatumPredajeZalbe(ext.datumPredajeZalbe);
        setDatumPredajeZalbeIzvor(zIzvor);
      }

      if (ext.podrucje && !edited.podrucje) {
        const currSpecific = ctx.podrucjeDetected && ctx.podrucje !== 'Ostalo';
        const newIsOstalo = ext.podrucje === 'Ostalo';
        if (!ctx.podrucjeDetected || (!currSpecific && !newIsOstalo)) {
          ctx.podrucje = ext.podrucje;
          ctx.podrucjeDetected = true;
          setPodrucje(ext.podrucje);
        }
      }

      const rawHandNote = (ext.rukopisnaNapomena || '').trim();
      const rawDocSummary = ((ext as { opisPredmeta?: string }).opisPredmeta ?? (!isKosuljica ? ext.napomena : '') ?? '').trim();
      const kosuljicaFallbackNote = isKosuljica && !rawHandNote ? (ext.napomena || '').trim() : '';
      const jacketOrHandNote = rawHandNote || kosuljicaFallbackNote;

      let nextNapomena = ctx.napomena;
      let addedHandNote = false;

      if (jacketOrHandNote) {
        const merged = mergeKosuljicaNote({
          currentNapomena: nextNapomena,
          newNote: jacketOrHandNote,
          isHandwrittenOrJacket: true,
          currentIsPureAutoSummary: ctx.napomenaIsPureAutoSummary,
        });
        if (merged.added) {
          nextNapomena = merged.napomena;
          ctx.napomenaIsPureAutoSummary = false;
          ctx.hasHandwrittenNote = true;
          setHasHandwrittenNote(true);
          addedHandNote = true;
        } else if (rawHandNote) {
          ctx.hasHandwrittenNote = true;
          setHasHandwrittenNote(true);
        }
      }

      if (rawDocSummary) {
        if (!nextNapomena.trim()) {
          nextNapomena = rawDocSummary;
          ctx.napomenaIsPureAutoSummary = true;
          ctx.hasAutoSummary = true;
        } else if (!ctx.hasAutoSummary && !edited.napomena) {
          const merged = mergeKosuljicaNote({
            currentNapomena: nextNapomena,
            newNote: rawDocSummary,
            isHandwrittenOrJacket: false,
            currentIsPureAutoSummary: false,
          });
          if (merged.added) {
            nextNapomena = merged.napomena;
            ctx.hasAutoSummary = true;
          }
        }
      }

      if (nextNapomena !== ctx.napomena) {
        ctx.napomena = nextNapomena;
        setNapomena(nextNapomena);
      }

      if (ext.izravnoMinistarstvu && !ctx.nadlezniStatus) {
        ctx.nadlezniStatus = 'potrebno_poslati';
        setNadlezniStatus('potrebno_poslati');
      }
      if (ext.tijeloPrvogStupnja) {
        setNadlezniTijelo(ext.tijeloPrvogStupnja);
      }

      const dateNote = ext.datumZaprimanja
        ? ` (zaprimljeno: ${new Date(ext.datumZaprimanja).toLocaleDateString('hr-HR')}${
            ext.izvorDatuma ? ` — ${ext.izvorDatuma}` : ''
          })`
        : '';
      const appealNote = ext.datumPredajeZalbe
        ? ` · predaja žalbe: ${new Date(ext.datumPredajeZalbe).toLocaleDateString('hr-HR')}`
        : '';
      const handNoteLabel =
        addedHandNote || jacketOrHandNote
          ? isKosuljica
            ? ' + zabilješke s košuljice'
            : ' + rukopisna napomena'
          : '';

      scannedDocLabelsRef.current.set(
        target.uid,
        `„${target.file.name}”${dateNote}${appealNote}${handNoteLabel}`
      );
      const summaryItems = Array.from(scannedDocLabelsRef.current.values());
      setScanSuccessMsg(
        summaryItems.length === 1
          ? `AI je pročitao dokument ${summaryItems[0]} te popunio polja predmeta.`
          : `AI je pročitao i spojio podatke iz ${summaryItems.length} dokumenta: ${summaryItems.join(' | ')}.`
      );
    } catch {
      if (scanSessionIdRef.current === sessionId) {
        setErrorMsg('Greška pri automatskom čitanju skena. Podatke možete unijeti ručno.');
      }
    }
  };

  const drainScanQueue = async (sessionId: number) => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      while (pendingScanQueueRef.current.length > 0) {
        if (scanSessionIdRef.current !== sessionId) return;
        const job = pendingScanQueueRef.current.shift()!;

        if (job.speculativeKosuljica && hasScannedKosuljicaRef.current) {
          continue;
        }
        if (!job.forceRescan && scannedUidsRef.current.has(job.uid)) {
          continue;
        }

        const currentTarget = queuedFilesRef.current.find((q) => q.uid === job.uid);
        if (!currentTarget) continue;

        scannedUidsRef.current.add(job.uid);
        await processSingleScan(currentTarget, sessionId);
      }
    } finally {
      if (scanSessionIdRef.current === sessionId) {
        isProcessingQueueRef.current = false;
        setExtractingUid(null);
      }
    }
  };

  const enqueueScans = (jobs: PendingScanJob[]) => {
    for (const job of jobs) {
      if (!job.forceRescan && scannedUidsRef.current.has(job.uid)) continue;
      if (pendingScanQueueRef.current.some((p) => p.uid === job.uid)) continue;
      pendingScanQueueRef.current.push(job);
    }
    if (pendingScanQueueRef.current.length > 0) {
      void drainScanQueue(scanSessionIdRef.current);
    }
  };

  const runScanExtractionOnItem = (target: QueuedCaseFile) => {
    enqueueScans([{ uid: target.uid, forceRescan: true }]);
  };

  const handleFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: QueuedCaseFile[] = Array.from(fileList).map((f, idx) => {
      const guessedRole = guessDocRoleFromFilename(f.name);
      return {
        uid: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        docType: guessedRole,
        skipUpload: guessedRole === 'Košuljica spisa',
      };
    });

    const wasEmpty = queuedFilesRef.current.length === 0;
    const nextQueue = [...queuedFilesRef.current, ...newItems];
    queuedFilesRef.current = nextQueue;
    setQueuedFiles(nextQueue);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const ctx = scanContextRef.current;
    const jobsToQueue: PendingScanJob[] = [];
    const addedIds = new Set<string>();
    const pushJob = (item: QueuedCaseFile | undefined, speculativeKosuljica = false) => {
      if (!item || addedIds.has(item.uid)) return;
      addedIds.add(item.uid);
      jobsToQueue.push({ uid: item.uid, speculativeKosuljica });
    };

    const popratniInBatch = newItems.filter((item) => item.docType === 'Popratni dopis I. stupnja');
    const kosuljicaInBatch = newItems.filter((item) => isKosuljicaRole(item.docType));
    const zalbaInBatch = newItems.filter((item) => item.docType === 'Žalba');

    // 1. Popratni dopis I. stupnja (ako još nije skeniran ili nedostaju osnovni podaci/datum žalbe)
    if (
      popratniInBatch.length > 0 &&
      (!hasScannedPopratniRef.current ||
        !ctx.klasa.trim() ||
        !ctx.stranka.trim() ||
        !ctx.datumPredajeZalbe.trim())
    ) {
      pushJob(popratniInBatch[0]);
    }

    // 2. Košuljica spisa se UVIJEK automatski čita bez obzira na redoslijed dodavanja,
    //    kako bi se zabilješke s košuljice, pisarnička naljepnica i UP/II KLASA uvijek dodale.
    for (const kItem of kosuljicaInBatch) {
      pushJob(kItem);
    }

    // 3. Žalba za datum predaje žalbe ako ga još nemamo i u ovom učitavanju nema popratnog dopisa
    if (
      zalbaInBatch.length > 0 &&
      !ctx.datumPredajeZalbe.trim() &&
      popratniInBatch.length === 0
    ) {
      pushJob(zalbaInBatch[0]);
    }

    // 4. Ako je ovo prvi dokument (ili još nemamo KLASU i stranku), očitaj prvi priloženi dokument
    if ((wasEmpty || (!ctx.klasa.trim() && !ctx.stranka.trim())) && jobsToQueue.length === 0) {
      pushJob(newItems[0]);
    }

    // 5. Ako košuljica još nije pročitana, a dodani su skenovi s generičkim nazivom (npr. scan_02.pdf, IMG_1234.jpg),
    //    provjeri do 2 takve datoteke da ne promaknu zabilješke na naknadno dodanoj košuljici.
    if (!hasScannedKosuljicaRef.current && kosuljicaInBatch.length === 0) {
      const ambiguousCandidates = newItems
        .filter((item) => !addedIds.has(item.uid) && isAmbiguousScanFilename(item.file.name))
        .sort((a, b) => {
          const aImg = /\.(jpg|jpeg|png|webp)$/i.test(a.file.name) ? 0 : 1;
          const bImg = /\.(jpg|jpeg|png|webp)$/i.test(b.file.name) ? 0 : 1;
          return aImg - bImg;
        })
        .slice(0, 2);

      for (const amb of ambiguousCandidates) {
        pushJob(amb, true);
      }
    }

    if (jobsToQueue.length > 0) {
      enqueueScans(jobsToQueue);
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
    pendingScanQueueRef.current = pendingScanQueueRef.current.filter((p) => p.uid !== uid);
    setQueuedFiles((prev) => {
      const next = prev.filter((item) => item.uid !== uid);
      queuedFilesRef.current = next;
      return next;
    });
  };

  const updateQueuedFileDocType = (uid: string, docType: string) => {
    const isNowKosuljica = isKosuljicaRole(docType);
    setQueuedFiles((prev) => {
      const next = prev.map((item) =>
        item.uid === uid
          ? {
              ...item,
              docType,
              skipUpload: isNowKosuljica
                ? isKosuljicaRole(item.docType)
                  ? Boolean(item.skipUpload)
                  : true
                : false,
            }
          : item
      );
      queuedFilesRef.current = next;
      return next;
    });

    if (isNowKosuljica && !scannedUidsRef.current.has(uid)) {
      enqueueScans([{ uid }]);
    }
  };

  const toggleQueuedFileSkipUpload = (uid: string) => {
    setQueuedFiles((prev) => {
      const next = prev.map((item) =>
        item.uid === uid ? { ...item, skipUpload: !item.skipUpload } : item
      );
      queuedFilesRef.current = next;
      return next;
    });
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
    if (datumPredajeZalbe.trim()) {
      formData.append('datum_predaje_zalbe', datumPredajeZalbe.trim());
      formData.append('datum_predaje_zalbe_izvor', datumPredajeZalbeIzvor || 'ručno');
    }
    formData.append('podrucje', podrucje);
    formData.append('napomena', napomena.trim());
    if (nadlezniStatus) {
      formData.append('nadlezni_postupak_status', nadlezniStatus);
      formData.append('nadlezni_postupak_tijelo', nadlezniTijelo.trim());
      if (nadlezniStatus === 'poslano') {
        formData.append('nadlezni_postupak_datum_slanja', nadlezniDatumSlanja || today);
      }
      if (nadlezniNapomena.trim()) {
        formData.append('nadlezni_postupak_napomena', nadlezniNapomena.trim());
      }
    }
    formData.append('sluzbenik_id', sluzbenikId);
    formData.append('sluzbenik_ime', sluzbenikIme);
    formData.append('interni_rok', interniRok);
    formData.append('uputa_voditelja', uputaVoditelja.trim());

    const result = await createPredmet(formData);

    if (result.error || !result.data) {
      setErrorMsg(result.error || 'Greška pri kreiranju predmeta.');
      setLoading(false);
      setUploadProgressText('');
      return;
    }

    const createdId = result.data.id;

    // Učitaj priložene PDF-ove / skenove u novootvoreni spis (preskoči košuljice označene samo za otvaranje)
    const filesToUpload = queuedFiles.filter((item) => !item.skipUpload);
    if (filesToUpload.length > 0) {
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i];
        setUploadProgressText(
          `Učitavam u spis (${i + 1}/${filesToUpload.length}): ${item.file.name}...`
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
        onClick={() => {
          setNadlezniStatus(defaultNadlezniStatus);
          scanContextRef.current.nadlezniStatus = defaultNadlezniStatus;
          setIsOpen(true);
        }}
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
                  Povucite sken košuljice spisa (s naljepnicom i rukopisnim bilješkama) ili dokumente spisa
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
                          Povucite sken košuljice, popratni dopis ili dokumente spisa
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          AI čita <strong>KLASU</strong>, <strong>stranku</strong>,{' '}
                          <strong>datum s naljepnice/štambilja</strong> i{' '}
                          <strong>rukopisne napomene na košuljici</strong> — ostale spise možete dodati i naknadno.
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
                            AI čita štambilj, zabilješke i podatke...
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
                            className="flex flex-col gap-1.5 bg-white/90 border border-slate-200/90 rounded-lg px-2.5 py-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
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
                                  disabled={isItemExtracting}
                                  onClick={() => runScanExtractionOnItem(item)}
                                  title="Izvuci KLASU, stranku, datum i rukopisne bilješke iz ovog dokumenta"
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

                            {item.docType === 'Košuljica spisa' && (
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-teal-800 bg-teal-50/80 border border-teal-200/80 rounded-md px-2 py-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.skipUpload)}
                                  onChange={() => toggleQueuedFileSkipUpload(item.uid)}
                                  className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                />
                                <span>
                                  Koristi košuljicu samo za otvaranje predmeta (ne spremaj sken među dokumente spisa)
                                </span>
                              </label>
                            )}
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setKlasa(val);
                      scanContextRef.current.klasa = val;
                      userEditedFieldsRef.current.klasa = val.trim().length > 0;
                    }}
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
                      Zaprimanje u Ministarstvu (štambilj) *
                    </label>
                    {datumIzvor && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          datumIzvor.includes('štambilj') || datumIzvor.includes('naljepnic')
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
                      const val = e.target.value;
                      setDatumPrimitka(val);
                      setDatumIzvor('');
                      scanContextRef.current.datumPrimitka = val;
                      scanContextRef.current.datumIzvor = '';
                      userEditedFieldsRef.current.datumPrimitka = true;
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  <label
                    htmlFor="datum_predaje_zalbe"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Datum predaje žalbe — početak ZUP roka (60 d.)
                  </label>
                  {datumPredajeZalbeIzvor && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Stamp className="w-2.5 h-2.5" />
                      {datumPredajeZalbeIzvor}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  id="datum_predaje_zalbe"
                  value={datumPredajeZalbe}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDatumPredajeZalbe(val);
                    setDatumPredajeZalbeIzvor('');
                    scanContextRef.current.datumPredajeZalbe = val;
                    userEditedFieldsRef.current.datumPredajeZalbe = val.trim().length > 0;
                  }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 leading-snug">
                  Opcionalno: ako otvarate predmet samo iz košuljice spisa, ostavite prazno. Rok od
                  60 dana računa se tek od predaje žalbe (automatski će se očitati kad naknadno
                  učitate sken spisa ili ga možete ručno upisati).
                </p>
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setStranka(val);
                      scanContextRef.current.stranka = val;
                      userEditedFieldsRef.current.stranka = val.trim().length > 0;
                    }}
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
                    onChange={(e) => {
                      const val = e.target.value as PredmetPodrucje;
                      setPodrucje(val);
                      scanContextRef.current.podrucje = val;
                      scanContextRef.current.podrucjeDetected = true;
                      userEditedFieldsRef.current.podrucje = true;
                    }}
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
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="napomena" className="text-xs font-semibold text-slate-700">
                    Napomena s košuljice / interna bilješka (ulazi u AI analizu i nacrt)
                  </label>
                  {hasHandwrittenNote && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                      Pročitano iz rukopisa
                    </span>
                  )}
                </div>
                <textarea
                  id="napomena"
                  rows={2}
                  value={napomena}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNapomena(val);
                    scanContextRef.current.napomena = val;
                    scanContextRef.current.napomenaIsPureAutoSummary = false;
                    userEditedFieldsRef.current.napomena = val.trim().length > 0;
                    if (!val.trim()) {
                      scanContextRef.current.hasHandwrittenNote = false;
                      scanContextRef.current.hasAutoSummary = false;
                      setHasHandwrittenNote(false);
                    }
                  }}
                  placeholder="npr. zastara, NKD, sporno činjenično stanje — ili automatski pročitano s košuljice..."
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              {/* Sekcija za žalbe poslane izravno Ministarstvu (Na nadležnom postupku) */}
              <div
                className={`p-3.5 rounded-xl border transition-colors space-y-2.5 ${
                  nadlezniStatus
                    ? 'bg-amber-50/70 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(nadlezniStatus)}
                    onChange={(e) => {
                      const nextStatus = e.target.checked ? 'potrebno_poslati' : '';
                      setNadlezniStatus(nextStatus);
                      scanContextRef.current.nadlezniStatus = nextStatus;
                    }}
                    className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-amber-600" />
                      Žalba poslana izravno Ministarstvu (kartica „Na nadležnom postupku”)
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Označite kad žalbu treba proslijediti tijelu prvog stupnja na nadležno
                      postupanje po čl. 110. st. 1. ZUP-a.
                    </span>
                  </div>
                </label>

                {nadlezniStatus && (
                  <div className="pt-2 border-t border-amber-200/80 space-y-2.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNadlezniStatus('potrebno_poslati');
                          scanContextRef.current.nadlezniStatus = 'potrebno_poslati';
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          nadlezniStatus === 'potrebno_poslati'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-amber-400'
                        }`}
                      >
                        Potrebno žurno poslati I. stupnju
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNadlezniStatus('poslano');
                          scanContextRef.current.nadlezniStatus = 'poslano';
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          nadlezniStatus === 'poslano'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                        }`}
                      >
                        Već poslano I. stupnju
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                          Tijelo prvog stupnja
                        </label>
                        <input
                          type="text"
                          value={nadlezniTijelo}
                          onChange={(e) => setNadlezniTijelo(e.target.value)}
                          placeholder="npr. Hrvatske vode, VGI..."
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      {nadlezniStatus === 'poslano' && (
                        <div>
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                            Datum slanja I. stupnju
                          </label>
                          <input
                            type="date"
                            value={nadlezniDatumSlanja}
                            onChange={(e) => setNadlezniDatumSlanja(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={nadlezniNapomena}
                        onChange={(e) => setNadlezniNapomena(e.target.value)}
                        placeholder={
                          nadlezniStatus === 'poslano'
                            ? 'Bilješka / klasa otpremnog dopisa (opcijski)...'
                            : 'Kratka uputa za slanje I. stupnju (opcijski)...'
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sekcija za delegiranje predmeta službeniku u rad */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                    Delegiranje predmeta službeniku u rad (opcijski)
                  </span>
                  <button
                    type="button"
                    onClick={() => setSluzbeniciModalOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    <Users className="w-3 h-3" />
                    Uredi popis službenika
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Zaduženi službenik (Obrađivač)
                    </label>
                    <select
                      value={sluzbenikId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSluzbenikId(val);
                        const found = sluzbenici.find((s) => s.id === val);
                        setSluzbenikIme(found ? found.imePrezime : '');
                      }}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Neraspoređeno / U mom radu —</option>
                      {sluzbenici.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.imePrezime} {s.radnoMjesto ? `(${s.radnoMjesto})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Interni rok za nacrt
                    </label>
                    <input
                      type="date"
                      value={interniRok}
                      onChange={(e) => setInterniRok(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {sluzbenikId && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Uputa nadređenog službeniku za rad
                    </label>
                    <input
                      type="text"
                      value={uputaVoditelja}
                      onChange={(e) => setUputaVoditelja(e.target.value)}
                      placeholder="npr. Poslati dopis za slanje žalbe na nadležni postupak / pripremiti nacrt rješenja..."
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
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

      <SluzbeniciModal
        isOpen={sluzbeniciModalOpen}
        onClose={() => setSluzbeniciModalOpen(false)}
        onUpdated={(updated) => setSluzbenici(updated)}
      />
    </>
  );
}
