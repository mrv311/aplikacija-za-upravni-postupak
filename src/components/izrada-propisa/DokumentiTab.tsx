'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  UploadCloud,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Search,
  Trash2,
  Eye,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Star,
  X,
  Loader2,
  RefreshCw,
  Check,
  Table2,
  BookOpen,
  Save,
  ScanText,
  Cpu,
  Calendar,
  Pencil,
  ArrowUpDown,
} from 'lucide-react';
import {
  PROPIS_DOC_ROLES,
  PROPIS_DOC_ROLE_MAP,
  type PropisDocument,
  type PropisDocRole,
  type PropisProject,
  type LocalFolderScanEntry,
} from '@/lib/izrada-propisa-types';
import {
  uploadPropisDocumentsAction,
  scanProjectLocalFolderAction,
  importFromLocalFolderAction,
  updatePropisDocumentAction,
  deletePropisDocumentAction,
  runManualOcrOnPropisDocAction,
  runManualOcrFromUploadAction,
  backfillDocumentMetadataAction,
} from '@/app/actions/izradaPropisaActions';

interface DokumentiTabProps {
  project: PropisProject;
  documents: PropisDocument[];
  onDocumentsChange: (docs: PropisDocument[]) => void;
  onRefresh: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateHr(value?: string): string {
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}.`;
  }
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) {
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    return `${d}.${m}.${dt.getFullYear()}.`;
  }
  return value;
}

export function DokumentiTab({
  project,
  documents,
  onDocumentsChange,
  onRefresh,
}: DokumentiTabProps) {
  const [roleFilter, setRoleFilter] = useState<'sve' | PropisDocRole>('sve');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'role_date' | 'date_desc' | 'date_asc' | 'name'>('role_date');
  const [editingDateDocId, setEditingDateDocId] = useState<string | null>(null);
  const [inlineDateValue, setInlineDateValue] = useState('');
  const [savingInlineDate, setSavingInlineDate] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  // Upload state
  const [uploadRole, setUploadRole] = useState<'auto' | PropisDocRole>('auto');
  const [autoOcrOnUpload, setAutoOcrOnUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingOcrDoc, setPendingOcrDoc] = useState<PropisDocument | null>(null);

  // Skener referentne mape (OneDrive)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanPath, setScanPath] = useState(project.referentnaMapa || '');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanEntries, setScanEntries] = useState<LocalFolderScanEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [roleOverrides, setRoleOverrides] = useState<Record<string, PropisDocRole>>({});
  const [scanSearch, setScanSearch] = useState('');
  const [importingLocal, setImportingLocal] = useState(false);

  // Preglednik / uređivač dokumenta
  const [inspectDoc, setInspectDoc] = useState<PropisDocument | null>(null);
  const [inspectMode, setInspectMode] = useState<'articles' | 'sheets' | 'text'>('text');
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [editText, setEditText] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editRole, setEditRole] = useState<PropisDocRole>('popratni_akt');
  const [editSender, setEditSender] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [ocrLoadingId, setOcrLoadingId] = useState<string | null>(null);

  const roleCounts = useMemo(() => {
    const counts: Record<PropisDocRole, number> = {
      aktualni_nacrt: 0,
      prethodna_verzija: 0,
      misljenje: 0,
      zapisnik: 0,
      excel_tarife: 0,
      popratni_akt: 0,
    };
    for (const d of documents) {
      counts[d.uloga] = (counts[d.uloga] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const roleOrder: Record<PropisDocRole, number> = {
      aktualni_nacrt: 0,
      prethodna_verzija: 1,
      misljenje: 2,
      excel_tarife: 3,
      zapisnik: 4,
      popratni_akt: 5,
    };

    return documents
      .filter((d) => {
        if (roleFilter !== 'sve' && d.uloga !== roleFilter) return false;
        if (!q) return true;
        return (
          d.prikazniNaziv.toLowerCase().includes(q) ||
          d.naziv.toLowerCase().includes(q) ||
          (d.posiljatelj || '').toLowerCase().includes(q) ||
          d.rawText.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') {
          return (b.datumVerzije || '0000-00-00').localeCompare(a.datumVerzije || '0000-00-00') ||
            b.createdAt.localeCompare(a.createdAt);
        }
        if (sortBy === 'date_asc') {
          return (a.datumVerzije || '9999-99-99').localeCompare(b.datumVerzije || '9999-99-99') ||
            a.createdAt.localeCompare(b.createdAt);
        }
        if (sortBy === 'name') {
          return a.prikazniNaziv.localeCompare(b.prikazniNaziv, 'hr');
        }
        if (roleOrder[a.uloga] !== roleOrder[b.uloga]) {
          return roleOrder[a.uloga] - roleOrder[b.uloga];
        }
        return (b.datumVerzije || '0000-00-00').localeCompare(a.datumVerzije || '0000-00-00') ||
          b.createdAt.localeCompare(a.createdAt);
      });
  }, [documents, roleFilter, searchQuery, sortBy]);

  const missingDatesCount = useMemo(
    () => documents.filter((d) => !d.datumVerzije).length,
    [documents]
  );

  const handleSaveInlineDate = async (doc: PropisDocument) => {
    setSavingInlineDate(true);
    const trimmed = inlineDateValue.trim() || undefined;
    const res = await updatePropisDocumentAction(project.id, doc.id, {
      datumVerzije: trimmed,
    });
    setSavingInlineDate(false);
    setEditingDateDocId(null);
    if (!res.error) {
      onDocumentsChange(
        documents.map((d) => (d.id === doc.id ? { ...d, datumVerzije: trimmed } : d))
      );
      onRefresh();
    }
  };

  const handleBackfillMetadata = async () => {
    setBackfilling(true);
    setFeedback(null);
    const res = await backfillDocumentMetadataAction(project.id);
    setBackfilling(false);
    if (res.success && res.docs) {
      onDocumentsChange(res.docs);
      setFeedback({
        type: 'ok',
        text: `Lokalna analiza dovršena (0 AI troška): automatski popunjeno ${res.updatedDates} datuma akata${
          res.updatedRoles ? `, ispravljeno ${res.updatedRoles} uloga` : ''
        }${res.updatedSenders ? `, prepoznato ${res.updatedSenders} pošiljatelja` : ''}.`,
      });
      onRefresh();
    }
  };

  const activeAiChars = useMemo(() => {
    return documents
      .filter((d) => d.uloga === 'aktualni_nacrt' || d.includeInAiContext)
      .reduce((acc, d) => acc + (d.rawText?.length || 0), 0);
  }, [documents]);

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploading(true);
    setFeedback(null);
    const fd = new FormData();
    fd.append('projectId', project.id);
    fd.append('uloga', uploadRole);
    fd.append('autoOcr', autoOcrOnUpload ? 'true' : 'false');
    for (const f of files) {
      fd.append('files', f);
    }

    const res = await uploadPropisDocumentsAction(fd);
    setUploading(false);

    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }

    const addedCount = res.added?.length || 0;
    const ocrPart =
      res.ocrCount && res.ocrCount > 0
        ? ` (${res.ocrCount} skenirani PDF automatski pročitan AI OCR-om)`
        : ' (lokalno parsiranje · 0 AI troška)';
    const errPart =
      res.errors && res.errors.length > 0 ? ` Upozorenja: ${res.errors.join(' | ')}` : '';
    setFeedback({
      type: addedCount > 0 ? 'ok' : 'err',
      text: `Učitano ${addedCount} datoteka${ocrPart}.${errPart}`,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    onRefresh();
  };

  const openScanner = async (pathOverride?: string) => {
    setScannerOpen(true);
    setScanning(true);
    setScanError(null);
    const res = await scanProjectLocalFolderAction(project.id, pathOverride ?? scanPath);
    setScanning(false);

    if (res.error) {
      setScanError(res.error);
      setScanEntries([]);
      return;
    }

    setScanPath(res.folderPath);
    setScanEntries(res.entries);

    // Automatski predodaberi preporučeni radni skup (koji još nije uvezen)
    const initialSel = new Set<string>();
    const overrides: Record<string, PropisDocRole> = {};
    for (const e of res.entries) {
      overrides[e.fullPath] = e.suggestedRole;
      if (e.recommended && !e.alreadyImported) {
        initialSel.add(e.fullPath);
      }
    }
    setSelectedPaths(initialSel);
    setRoleOverrides(overrides);
  };

  const handleImportSelectedFromFolder = async () => {
    const chosen = scanEntries.filter((e) => selectedPaths.has(e.fullPath) && !e.alreadyImported);
    if (chosen.length === 0) return;

    setImportingLocal(true);
    const res = await importFromLocalFolderAction(
      project.id,
      chosen.map((c) => ({
        fullPath: c.fullPath,
        uloga: roleOverrides[c.fullPath] || c.suggestedRole,
        posiljatelj: c.suggestedSender,
        datumVerzije: c.suggestedDate,
      }))
    );
    setImportingLocal(false);

    if (res.error) {
      setScanError(res.error);
      return;
    }

    setScannerOpen(false);
    setFeedback({
      type: 'ok',
      text: `Lokalno uvezeno ${res.importedCount} dokumenata (0 AI troška)${
        res.skippedCount ? `, preskočeno već uvezenih: ${res.skippedCount}` : ''
      }${res.errors && res.errors.length > 0 ? `. Greške: ${res.errors.join(' | ')}` : '.'}`,
    });
    onRefresh();
  };

  const handleToggleAiContext = async (doc: PropisDocument) => {
    const nextVal = !doc.includeInAiContext;
    onDocumentsChange(
      documents.map((d) => (d.id === doc.id ? { ...d, includeInAiContext: nextVal } : d))
    );
    await updatePropisDocumentAction(project.id, doc.id, { includeInAiContext: nextVal });
  };

  const handleSetAsCurrentDraft = async (doc: PropisDocument) => {
    const res = await updatePropisDocumentAction(project.id, doc.id, {
      uloga: 'aktualni_nacrt',
      includeInAiContext: true,
    });
    if (!res.error) {
      setFeedback({
        type: 'ok',
        text: `„${doc.prikazniNaziv}” je postavljen kao Aktualni nacrt (prethodni je prebačen u Prethodne verzije).`,
      });
      onRefresh();
    }
  };

  const handleDeleteDoc = async (doc: PropisDocument) => {
    if (!confirm(`Ukloniti dokument „${doc.prikazniNaziv}” iz projekta?`)) return;
    const res = await deletePropisDocumentAction(project.id, doc.id);
    if (!res.error) {
      onDocumentsChange(documents.filter((d) => d.id !== doc.id));
      if (inspectDoc?.id === doc.id) setInspectDoc(null);
      onRefresh();
    }
  };

  const handleRunManualOcr = async (doc: PropisDocument) => {
    // Ako dokument nema lokalnu putanju na poslužitelju (npr. web verzija Vercel), odmah ponudi odabir PDF-a s računala za in-memory AI OCR
    if (!doc.lokalnaPutanja) {
      setPendingOcrDoc(doc);
      setTimeout(() => ocrFileInputRef.current?.click(), 0);
      return;
    }

    if (
      !confirm(
        `Pokrenuti AI OCR čitanje (Gemini Flash) za skenirani PDF „${doc.prikazniNaziv}”?`
      )
    ) {
      return;
    }
    setOcrLoadingId(doc.id);
    setFeedback(null);
    const res = await runManualOcrOnPropisDocAction(project.id, doc.id);
    setOcrLoadingId(null);

    if ((res as any).needsFileReupload) {
      setPendingOcrDoc(doc);
      setFeedback({
        type: 'ok',
        text: `Odaberite izvorni PDF za „${doc.prikazniNaziv}” s računala kako bi ga AI OCR odmah pročitao.`,
      });
      setTimeout(() => ocrFileInputRef.current?.click(), 0);
      return;
    }

    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
    } else {
      setFeedback({
        type: 'ok',
        text: `AI OCR uspješno dovršen za „${doc.prikazniNaziv}”.`,
      });
      onRefresh();
    }
  };

  const handleOcrFileSelected = async (file: File) => {
    if (!pendingOcrDoc) return;
    const targetDoc = pendingOcrDoc;
    setPendingOcrDoc(null);
    setOcrLoadingId(targetDoc.id);
    setFeedback(null);

    const fd = new FormData();
    fd.append('projectId', project.id);
    fd.append('docId', targetDoc.id);
    fd.append('file', file);

    const res = await runManualOcrFromUploadAction(fd);
    setOcrLoadingId(null);
    if (ocrFileInputRef.current) ocrFileInputRef.current.value = '';

    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
    } else {
      setFeedback({
        type: 'ok',
        text: `AI OCR uspješno dovršen za „${targetDoc.prikazniNaziv}” (${(
          res.doc?.rawText?.length || 0
        ).toLocaleString('hr-HR')} znakova).`,
      });
      onRefresh();
    }
  };

  const openInspector = (doc: PropisDocument) => {
    setInspectDoc(doc);
    setEditTitle(doc.prikazniNaziv);
    setEditRole(doc.uloga);
    setEditSender(doc.posiljatelj || '');
    setEditDate(doc.datumVerzije || '');
    setEditText(doc.rawText || '');
    setActiveSheetIdx(0);
    if (doc.parsedDraft && doc.parsedDraft.clanci.length > 0) {
      setInspectMode('articles');
    } else if (doc.excelSheets && doc.excelSheets.length > 0) {
      setInspectMode('sheets');
    } else {
      setInspectMode('text');
    }
  };

  const handleSaveInspector = async () => {
    if (!inspectDoc) return;
    setSavingEdit(true);
    const res = await updatePropisDocumentAction(project.id, inspectDoc.id, {
      prikazniNaziv: editTitle.trim() || inspectDoc.prikazniNaziv,
      uloga: editRole,
      posiljatelj: editSender.trim() || undefined,
      datumVerzije: editDate.trim() || undefined,
      rawText: editText,
    });
    setSavingEdit(false);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    setInspectDoc(null);
    setFeedback({ type: 'ok', text: 'Izmjene dokumenta su spremljene.' });
    onRefresh();
  };

  const filteredScanEntries = useMemo(() => {
    const q = scanSearch.trim().toLowerCase();
    if (!q) return scanEntries;
    return scanEntries.filter(
      (e) =>
        e.fileName.toLowerCase().includes(q) ||
        e.folderName.toLowerCase().includes(q) ||
        (e.suggestedSender || '').toLowerCase().includes(q)
    );
  }, [scanEntries, scanSearch]);

  return (
    <div className="space-y-5">
      {/* Povratna poruka */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Gornji blok: Drag & Drop Upload + 1-klik skener referentne mape */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              handleUploadFiles(e.dataTransfer.files);
            }
          }}
          className={`lg:col-span-2 rounded-2xl border-2 border-dashed p-5 transition-all bg-white dark:bg-slate-900 ${
            isDragging
              ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
              : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <UploadCloud className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Učitaj dokumente povjerenstva (lokalno + auto AI OCR za skenove)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Povuci i ispusti ili odaberi više datoteka: <span className="font-mono">.docx</span> (čuva tablice), <span className="font-mono">.doc</span>, <span className="font-mono">.xlsx</span>, <span className="font-mono">.pdf</span>, <span className="font-mono">.txt</span>
                </p>
                <label className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOcrOnUpload}
                    onChange={(e) => setAutoOcrOnUpload(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Automatski pokreni AI OCR ako je učitani PDF skeniran (radi i na web verziji)
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={uploadRole}
                onChange={(e) => setUploadRole(e.target.value as 'auto' | PropisDocRole)}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="auto">Uloga: Automatski prepoznaj</option>
                {PROPIS_DOC_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".docx,.doc,.xlsx,.xls,.pdf,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleUploadFiles(e.target.files);
                }}
              />
              <input
                ref={ocrFileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleOcrFileSelected(f);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-60 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {uploading ? 'Obrada...' : 'Odaberi datoteke'}
              </button>
            </div>
          </div>
        </div>

        {/* Kartica za 1-klik skener referentne OneDrive mape */}
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/70 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/30 dark:to-slate-900 p-5 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
              <FolderOpen className="w-4 h-4" />
              Referentna OneDrive mapa
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 font-mono">
              {project.referentnaMapa || 'Nije podešena referentna mapa'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openScanner()}
            className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <FolderOpen className="w-4 h-4" />
            Skeniraj i uvezi iz lokalne mape
          </button>
        </div>
      </div>

      {/* Filtar po ulogama + pretraga + status AI konteksta */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRoleFilter('sve')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                roleFilter === 'sve'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Sve ({documents.length})
            </button>
            {PROPIS_DOC_ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoleFilter(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  roleFilter === r.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {r.shortLabel} ({roleCounts[r.id] || 0})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {missingDatesCount > 0 && (
              <button
                type="button"
                disabled={backfilling}
                onClick={handleBackfillMetadata}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                title="Automatski pročitaj datume iz naziva i zaglavlja već učitanih dokumenata (0 AI troška)"
              >
                {backfilling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                Auto-otkrij datume ({missingDatesCount})
              </button>
            )}

            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1">
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-[11px] font-semibold bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="role_date">Po ulozi i datumu</option>
                <option value="date_desc">Datum akta (najnoviji)</option>
                <option value="date_asc">Datum akta (najstariji)</option>
                <option value="name">Naziv (A–Ž)</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Sparkles className="w-3.5 h-3.5" />
              U AI kontekstu:{' '}
              {documents.filter((d) => d.uloga === 'aktualni_nacrt' || d.includeInAiContext).length}{' '}
              dok. (~{Math.round(activeAiChars / 1000)}k zn.)
            </div>

            <div className="relative w-52">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Traži dokument ili pojam..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Lista dokumenata */}
        {filteredDocs.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
            <FileText className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {documents.length === 0
                ? 'Još nema učitanih dokumenata u ovom projektu.'
                : 'Nema dokumenata koji odgovaraju odabranom filtru.'}
            </p>
            {documents.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Kliknite <strong>„Skeniraj i uvezi iz lokalne mape”</strong> za brzi uvoz radnog paketa iz OneDrive mape ili povucite datoteke u gornje polje.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredDocs.map((doc) => {
              const roleMeta = PROPIS_DOC_ROLE_MAP[doc.uloga];
              const isDraft = doc.uloga === 'aktualni_nacrt' || doc.uloga === 'prethodna_verzija';
              const isExcel = doc.ekstenzija === 'xlsx' || doc.ekstenzija === 'xls';
              const isCurrent = doc.uloga === 'aktualni_nacrt';

              return (
                <div
                  key={doc.id}
                  className={`py-3.5 px-2 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors rounded-xl ${
                    isCurrent
                      ? 'bg-blue-50/40 dark:bg-blue-950/20 px-3 border border-blue-200/70 dark:border-blue-900/60 my-1'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isExcel
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : isCurrent
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {isExcel ? (
                        <FileSpreadsheet className="w-4 h-4" />
                      ) : isCurrent ? (
                        <Star className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10.5px] font-bold px-2 py-0.5 rounded border ${roleMeta.badgeClass}`}
                        >
                          {roleMeta.shortLabel}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          .{doc.ekstenzija}
                        </span>
                        {doc.posiljatelj && (
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
                            {doc.posiljatelj}
                          </span>
                        )}
                        {doc.needsOcr ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <AlertTriangle className="w-3 h-3" />
                            Sken bez teksta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                            <Cpu className="w-2.5 h-2.5" />
                            {doc.izvorTeksta === 'rucni_ai_ocr'
                              ? 'AI OCR'
                              : doc.izvorTeksta === 'rucno_uredeno'
                              ? 'Uređeno'
                              : 'Lokalno (0 AI)'}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openInspector(doc)}
                        className="text-left text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors break-words cursor-pointer"
                      >
                        {doc.prikazniNaziv}
                      </button>

                      {/* Jasan redak s datumom akta + datumom dodavanja odmah ispod naziva */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                        {editingDateDocId === doc.id ? (
                          <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-700 rounded-lg px-2 py-0.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            <input
                              type="date"
                              value={inlineDateValue}
                              onChange={(e) => setInlineDateValue(e.target.value)}
                              className="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              disabled={savingInlineDate}
                              onClick={() => handleSaveInlineDate(doc)}
                              className="px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              {savingInlineDate ? '...' : 'Spremi'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDateDocId(null)}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDateDocId(doc.id);
                              setInlineDateValue(doc.datumVerzije || '');
                            }}
                            title="Kliknite za izmjenu datuma akta"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer ${
                              doc.datumVerzije
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-blue-400'
                                : 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                            }`}
                          >
                            <Calendar className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            {doc.datumVerzije
                              ? `Datum akta: ${formatDateHr(doc.datumVerzije)}`
                              : 'Dodaj datum akta'}
                            <Pencil className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                          </button>
                        )}

                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          Učitano: {formatDateHr(doc.createdAt)}
                        </span>
                        <span>·</span>
                        <span>{formatBytes(doc.velicinaBajta)}</span>
                        <span>{(doc.rawText?.length || 0).toLocaleString('hr-HR')} znakova</span>
                        {doc.parsedDraft && doc.parsedDraft.clanci.length > 0 && (
                          <span className="font-semibold text-blue-700 dark:text-blue-300">
                            {doc.parsedDraft.clanci.length} članaka
                            {doc.parsedDraft.obrazlozenje ? ' + Obrazloženje' : ''}
                          </span>
                        )}
                        {doc.excelSheets && doc.excelSheets.length > 0 && (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            {doc.excelSheets.length}{' '}
                            {doc.excelSheets.length === 1 ? 'list' : 'lista'} (
                            {doc.excelSheets.map((s) => s.name).slice(0, 3).join(', ')})
                          </span>
                        )}
                        {!isExcel && doc.htmlTablesCount ? (
                          <span>{doc.htmlTablesCount} Word tablica</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Akcije na dokumentu */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {doc.needsOcr && (
                      <button
                        type="button"
                        disabled={ocrLoadingId === doc.id}
                        onClick={() => handleRunManualOcr(doc)}
                        title={
                          doc.lokalnaPutanja
                            ? 'Pokreni AI OCR na lokalnoj PDF datoteci'
                            : 'Odaberi isti PDF s računala za trenutni AI OCR na web verziji'
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {ocrLoadingId === doc.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ScanText className="w-3.5 h-3.5" />
                        )}
                        {ocrLoadingId === doc.id
                          ? 'AI OCR...'
                          : doc.lokalnaPutanja
                            ? 'Pokreni AI OCR'
                            : 'AI OCR (odaberi PDF)'}
                      </button>
                    )}

                    {doc.uloga === 'prethodna_verzija' && (
                      <button
                        type="button"
                        onClick={() => handleSetAsCurrentDraft(doc)}
                        title="Postavi ovu verziju kao Aktualni nacrt"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold cursor-pointer"
                      >
                        <Star className="w-3.5 h-3.5" />
                        Postavi kao aktualni
                      </button>
                    )}

                    {/* Prekidač U AI kontekstu */}
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => handleToggleAiContext(doc)}
                      title={
                        isCurrent
                          ? 'Aktualni nacrt je uvijek uključen u AI kontekst'
                          : 'Uključi ili isključi ovaj dokument iz AI chata'
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        isCurrent || doc.includeInAiContext
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                          : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      } ${isCurrent ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {isCurrent || doc.includeInAiContext ? 'U AI kontekstu' : 'Izvan AI'}
                    </button>

                    <button
                      type="button"
                      onClick={() => openInspector(doc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isDraft && doc.parsedDraft?.clanci.length ? 'Članci' : 'Pregled'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(doc)}
                      title="Ukloni iz projekta"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Skener referentne OneDrive mape */}
      {scannerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setScannerOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-amber-600" />
                  Skener referentne mape (100% lokalno · 0 AI troška)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automatski prepoznaje uloge, datume i pošiljatelje. Odaberite preporučeni radni skup ili pojedinačne datoteke.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Putanja i kontrolna traka */}
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  placeholder="C:\Users\...\Uredba NUV 2026"
                  className="flex-1 min-w-64 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => openScanner(scanPath)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                  Ponovno skeniraj
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set<string>();
                      for (const e of scanEntries) {
                        if (e.recommended && !e.alreadyImported) next.add(e.fullPath);
                      }
                      setSelectedPaths(next);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold cursor-pointer"
                  >
                    Preporučeni radni paket (
                    {scanEntries.filter((e) => e.recommended && !e.alreadyImported).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set<string>();
                      for (const e of filteredScanEntries) {
                        if (!e.alreadyImported) next.add(e.fullPath);
                      }
                      setSelectedPaths(next);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Označi prikazane
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPaths(new Set())}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium cursor-pointer"
                  >
                    Poništi odabir
                  </button>
                </div>

                <div className="relative w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={scanSearch}
                    onChange={(e) => setScanSearch(e.target.value)}
                    placeholder="Filtriraj datoteke ili podmape..."
                    className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Popis skeniranih datoteka */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {scanning ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-sm">Skeniram mapu i kategoriziram datoteke...</span>
                </div>
              ) : scanError ? (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                  {scanError}
                </div>
              ) : filteredScanEntries.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Nema podržanih datoteka (.docx, .doc, .xlsx, .pdf, .txt) u ovoj mapi.
                </p>
              ) : (
                filteredScanEntries.map((entry) => {
                  const checked = selectedPaths.has(entry.fullPath);
                  const assignedRole = roleOverrides[entry.fullPath] || entry.suggestedRole;

                  return (
                    <div
                      key={entry.fullPath}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 py-2 rounded-xl border text-xs transition-colors ${
                        entry.alreadyImported
                          ? 'bg-slate-50/70 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800 opacity-65'
                          : checked
                          ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={entry.alreadyImported}
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(selectedPaths);
                            if (e.target.checked) next.add(entry.fullPath);
                            else next.delete(entry.fullPath);
                            setSelectedPaths(next);
                          }}
                          className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white break-all">
                              {entry.fileName}
                            </span>
                            {entry.recommended && !entry.alreadyImported && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                Preporučeno
                              </span>
                            )}
                            {entry.alreadyImported && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                <Check className="w-3 h-3" /> Već uvezeno
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2.5">
                            <span className="font-mono">{entry.folderName}</span>
                            <span>{formatBytes(entry.sizeBytes)}</span>
                            {entry.suggestedSender && (
                              <span className="text-amber-700 dark:text-amber-300 font-medium">
                                {entry.suggestedSender}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>

                      <select
                        disabled={entry.alreadyImported}
                        value={assignedRole}
                        onChange={(e) =>
                          setRoleOverrides((prev) => ({
                            ...prev,
                            [entry.fullPath]: e.target.value as PropisDocRole,
                          }))
                        }
                        className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 shrink-0"
                      >
                        {PROPIS_DOC_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Pronađeno <strong>{scanEntries.length}</strong> podržanih datoteka · Odabrano za uvoz:{' '}
                <strong>{selectedPaths.size}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Zatvori
                </button>
                <button
                  type="button"
                  disabled={importingLocal || selectedPaths.size === 0}
                  onClick={handleImportSelectedFromFolder}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {importingLocal ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {importingLocal
                    ? 'Lokalno parsiram...'
                    : `Uvezi odabrano (${selectedPaths.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Preglednik i uređivač dokumenta (Članci / Excel listovi / Puni tekst) */}
      {inspectDoc && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setInspectDoc(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none pb-0.5"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as PropisDocRole)}
                    className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    {PROPIS_DOC_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editSender}
                    onChange={(e) => setEditSender(e.target.value)}
                    placeholder="Pošiljatelj / tijelo (npr. UZZ, MFIN...)"
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 w-56"
                  />
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    title="Datum akta / verzije"
                    className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 w-40"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabovi preglednika */}
            <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-1.5">
                {inspectDoc.parsedDraft && inspectDoc.parsedDraft.clanci.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setInspectMode('articles')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      inspectMode === 'articles'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Strukturirani članci ({inspectDoc.parsedDraft.clanci.length})
                  </button>
                )}
                {inspectDoc.excelSheets && inspectDoc.excelSheets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setInspectMode('sheets')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      inspectMode === 'sheets'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    Excel tablice ({inspectDoc.excelSheets.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectMode('text')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    inspectMode === 'text'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Cijeli tekst / Uredi
                </button>
              </div>

              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveInspector}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingEdit ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Spremi izmjene
              </button>
            </div>

            {/* Sadržaj preglednika */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/40">
              {inspectMode === 'articles' && inspectDoc.parsedDraft ? (
                <div className="space-y-4">
                  {inspectDoc.parsedDraft.preambula && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Preambula i naziv akta
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {inspectDoc.parsedDraft.preambula}
                      </div>
                    </div>
                  )}

                  {inspectDoc.parsedDraft.clanci.map((cl) => (
                    <div
                      key={cl.key}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                          {cl.oznaka}
                          {cl.naslov ? ` — ${cl.naslov}` : ''}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
                          <span>{cl.stavciCount} st.</span>
                          {cl.imaTablicu && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                              Sadrži tablicu
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                        {cl.tekst}
                      </div>
                    </div>
                  ))}

                  {inspectDoc.parsedDraft.obrazlozenje && (
                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1.5">
                        Ugrađeno Obrazloženje u nacrtu
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {inspectDoc.parsedDraft.obrazlozenje}
                      </div>
                    </div>
                  )}
                </div>
              ) : inspectMode === 'sheets' && inspectDoc.excelSheets ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {inspectDoc.excelSheets.map((s, idx) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setActiveSheetIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          activeSheetIdx === idx
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {s.name} ({s.rowCount} red.)
                      </button>
                    ))}
                  </div>

                  {inspectDoc.excelSheets[activeSheetIdx] && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {inspectDoc.excelSheets[activeSheetIdx].previewRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white'
                                  : 'border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                              }
                            >
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="px-2.5 py-1.5 border-r border-slate-100 dark:border-slate-800 whitespace-nowrap max-w-xs truncate"
                                  title={cell}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={22}
                  className="w-full h-full min-h-[420px] p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
