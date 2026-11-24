'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Sparkles,
  Download,
  Plus,
  Search,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  FileSpreadsheet,
  Building2,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Wand2,
  Scissors,
  Filter,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  MessageSquare,
} from 'lucide-react';
import {
  PRIMJEDBA_KATEGORIJE_TIJELA,
  PRIMJEDBA_STATUSI,
  type PrimjedbaItem,
  type PrimjedbaKategorijaTijela,
  type PrimjedbaStatus,
  type PropisDocument,
  type PropisProject,
} from '@/lib/izrada-propisa-types';
import { uploadPropisDocumentsAction } from '@/app/actions/izradaPropisaActions';
import {
  extractPrimjedbeFromDocsAction,
  importExistingPrimjedbeDocxAction,
  splitCombinedPrimjedbaAction,
  suggestSinglePrimjedbaResponseAction,
  upsertPrimjedbaAction,
  deletePrimjedbaAction,
  clearAllPrimjedbeAction,
} from '@/app/actions/izradaPropisaPrimjedbeActions';
import { articleSortRank } from '@/lib/propis-article-parser';

function isSubstantivePrimjedba(item: PrimjedbaItem): boolean {
  const txt = (item.tekstPrimjedbe || '').trim();
  const obr = (item.obrazlozenje || '').trim();
  if (obr.length > 0) return true;
  if (!txt) return false;
  if (
    /^\s*(?:\((?:bez\s+primjedbi|mi[šs]ljenje\s+jo[šs]\s+nije\s+zaprimljeno)[^)]*\)|nema\s+primjedbi\.?|bez\s+primjedbi\.?)\s*$/i.test(
      txt
    )
  ) {
    return false;
  }
  return true;
}

function canSplitCombinedItem(item: PrimjedbaItem): boolean {
  const txt = item.tekstPrimjedbe || '';
  const uzClanakMatches = txt.match(/uz\s+član(?:ak|ke)\s+\d+/gi) || [];
  if (uzClanakMatches.length >= 2) return true;
  return txt.length > 420;
}

function getRemarkPreview(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 135) return clean;
  return `${clean.slice(0, 132).trimEnd()}…`;
}

interface PrimjedbeTabProps {
  project: PropisProject;
  documents: PropisDocument[];
  primjedbe: PrimjedbaItem[];
  onPrimjedbeChange: (items: PrimjedbaItem[]) => void;
  onDocumentsChange?: (docs: PropisDocument[]) => void;
  onRefresh?: () => void;
}

const STATUS_BADGE: Record<PrimjedbaStatus, string> = {
  'Prihvaća se':
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  'Djelomično se prihvaća':
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  'Ne prihvaća se':
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  'Prima se na znanje':
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  'Na razmatranju':
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export function PrimjedbeTab({
  project,
  documents,
  primjedbe,
  onPrimjedbeChange,
  onDocumentsChange,
  onRefresh,
}: PrimjedbeTabProps) {
  const [groupBy, setGroupBy] = useState<'clanak' | 'tijelo'>('tijelo');
  const [statusFilter, setStatusFilter] = useState<'sve' | PrimjedbaStatus>('sve');
  const [tijeloFilter, setTijeloFilter] = useState<string>('sve');
  const [onlySubstantive, setOnlySubstantive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Harmonika (accordion) stanje: grupe + pojedinačne stavke
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Modal: Izravni upload novog mišljenja (PDF/DOCX) + AI OCR + automatsko izdvajanje
  const [uploadOpinionOpen, setUploadOpinionOpen] = useState(false);
  const [uploadOpinionFiles, setUploadOpinionFiles] = useState<File[]>([]);
  const [uploadOpinionSender, setUploadOpinionSender] = useState('');
  const [uploadOpinionAutoOcr, setUploadOpinionAutoOcr] = useState(true);
  const [uploadOpinionAutoExtract, setUploadOpinionAutoExtract] = useState(true);
  const [uploadOpinionModel, setUploadOpinionModel] = useState<'flash' | 'pro'>('flash');
  const [uploadingOpinionStage, setUploadingOpinionStage] = useState<string | null>(null);
  const [uploadOpinionDrag, setUploadOpinionDrag] = useState(false);
  const opinionFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal: AI izdvajanje iz mišljenja
  const [aiExtractOpen, setAiExtractOpen] = useState(false);
  const [selectedOpinionIds, setSelectedOpinionIds] = useState<Set<string>>(new Set());
  const [extractModel, setExtractModel] = useState<'flash' | 'pro'>('flash');
  const [extracting, setExtracting] = useState(false);

  // Modal: Uvoz Word tablice (lokalno + opcija pametnog AI razdvajanja spojenih ćelija)
  const [docxImportOpen, setDocxImportOpen] = useState(false);
  const [selectedTableDocId, setSelectedTableDocId] = useState('');
  const [smartAiSplit, setSmartAiSplit] = useState(true);
  const [skipEmptyRows, setSkipEmptyRows] = useState(true);
  const [importingDocx, setImportingDocx] = useState(false);

  // Modal: Ručni unos / uređivanje primjedbe
  const [editModal, setEditModal] = useState<{
    id?: string;
    tijelo: string;
    kategorijaTijela: PrimjedbaKategorijaTijela;
    clanakOznaka: string;
    tekstPrimjedbe: string;
    status: PrimjedbaStatus;
    obrazlozenje: string;
    predlozenaIzmjena: string;
    pravnaReferenca: string;
  } | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // Per-row AI prijedlog odgovora i AI razvrstavanje spojenih primjedbi
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [includeClanakCol, setIncludeClanakCol] = useState(true);

  const opinionDocs = useMemo(
    () => documents.filter((d) => d.uloga === 'misljenje' && !d.needsOcr),
    [documents]
  );

  const scannedOpinionDocs = useMemo(
    () => documents.filter((d) => d.uloga === 'misljenje' && d.needsOcr),
    [documents]
  );

  const candidateTableDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          (d.uloga === 'popratni_akt' || d.uloga === 'misljenje') &&
          (d.ekstenzija === 'docx' || /tablica/i.test(d.naziv) || (d.htmlTablesCount || 0) > 0)
      ),
    [documents]
  );

  const uniqueBodies = useMemo(
    () => Array.from(new Set(primjedbe.map((p) => p.tijelo))).sort((a, b) => a.localeCompare(b, 'hr')),
    [primjedbe]
  );

  const stats = useMemo(() => {
    const s = {
      ukupno: primjedbe.length,
      prihvaceno: 0,
      djelomicno: 0,
      odbijeno: 0,
      znanje: 0,
      razmatranje: 0,
    };
    for (const p of primjedbe) {
      if (p.status === 'Prihvaća se') s.prihvaceno++;
      else if (p.status === 'Djelomično se prihvaća') s.djelomicno++;
      else if (p.status === 'Ne prihvaća se') s.odbijeno++;
      else if (p.status === 'Prima se na znanje') s.znanje++;
      else s.razmatranje++;
    }
    return s;
  }, [primjedbe]);

  const substantiveCount = useMemo(
    () => primjedbe.filter((p) => isSubstantivePrimjedba(p)).length,
    [primjedbe]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return primjedbe.filter((p) => {
      if (onlySubstantive && !isSubstantivePrimjedba(p)) return false;
      if (statusFilter !== 'sve' && p.status !== statusFilter) return false;
      if (tijeloFilter !== 'sve' && p.tijelo !== tijeloFilter) return false;
      if (!q) return true;
      return (
        p.tijelo.toLowerCase().includes(q) ||
        p.clanakOznaka.toLowerCase().includes(q) ||
        p.tekstPrimjedbe.toLowerCase().includes(q) ||
        p.obrazlozenje.toLowerCase().includes(q)
      );
    });
  }, [primjedbe, onlySubstantive, statusFilter, tijeloFilter, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, PrimjedbaItem[]>();
    for (const item of filtered) {
      const key = groupBy === 'clanak' ? item.clanakOznaka || 'Opće primjedbe' : item.tijelo;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    const entries = Array.from(map.entries()).map(([key, items]) => {
      const sortedItems = [...items].sort((a, b) => {
        const diff = articleSortRank(a.clanakOznaka) - articleSortRank(b.clanakOznaka);
        if (diff !== 0) return diff;
        return a.tijelo.localeCompare(b.tijelo, 'hr');
      });
      return [key, sortedItems] as [string, PrimjedbaItem[]];
    });
    if (groupBy === 'clanak') {
      entries.sort((a, b) => articleSortRank(a[0]) - articleSortRank(b[0]));
    } else {
      // Po tijelima: tijela sa stvarnim/sadržajnim primjedbama idu na vrh, prazna/"Nema primjedbi" ispod
      entries.sort((a, b) => {
        const aHasSubst = a[1].some((i) => isSubstantivePrimjedba(i));
        const bHasSubst = b[1].some((i) => isSubstantivePrimjedba(i));
        if (aHasSubst !== bHasSubst) return aHasSubst ? -1 : 1;
        return a[0].localeCompare(b[0], 'hr');
      });
    }
    return entries;
  }, [filtered, groupBy]);

  const toggleGroup = (groupTitle: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupTitle)) next.delete(groupTitle);
      else next.add(groupTitle);
      return next;
    });
  };

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleAllItemsInGroup = (items: PrimjedbaItem[]) => {
    const allOpen = items.every((i) => expandedItems.has(i.id));
    setExpandedItems((prev) => {
      const next = new Set(prev);
      for (const i of items) {
        if (allOpen) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  };

  const allVisibleItemsExpanded = useMemo(
    () => filtered.length > 0 && filtered.every((i) => expandedItems.has(i.id)),
    [filtered, expandedItems]
  );

  const handleToggleExpandAll = () => {
    if (allVisibleItemsExpanded) {
      setExpandedItems(new Set());
    } else {
      setCollapsedGroups(new Set());
      setExpandedItems(new Set(filtered.map((i) => i.id)));
    }
  };

  const handleDirectOpinionUpload = async () => {
    if (uploadOpinionFiles.length === 0) return;
    setFeedback(null);
    setUploadingOpinionStage(
      uploadOpinionAutoOcr
        ? 'Učitavam dokument i provodim AI OCR za eventualne skenirane PDF-ove...'
        : 'Učitavam i lokalno parsiram dokument...'
    );

    const prevIds = new Set(primjedbe.map((p) => p.id));

    const fd = new FormData();
    fd.append('projectId', project.id);
    fd.append('uloga', 'misljenje');
    fd.append('autoOcr', uploadOpinionAutoOcr ? 'true' : 'false');
    if (uploadOpinionSender.trim()) {
      fd.append('posiljatelj', uploadOpinionSender.trim());
    }
    for (const f of uploadOpinionFiles) {
      fd.append('files', f);
    }

    const uploadRes = await uploadPropisDocumentsAction(fd);
    if (uploadRes.error || !uploadRes.added || uploadRes.added.length === 0) {
      setUploadingOpinionStage(null);
      setFeedback({
        type: 'err',
        text:
          uploadRes.error ||
          (uploadRes.errors && uploadRes.errors.length > 0
            ? uploadRes.errors.join(' | ')
            : 'Nije uspjelo učitavanje odabrane datoteke.'),
      });
      return;
    }

    if (onDocumentsChange) {
      onDocumentsChange([...uploadRes.added, ...documents]);
    }
    if (onRefresh) onRefresh();

    const readableAdded = uploadRes.added.filter(
      (d) => !d.needsOcr && d.rawText && d.rawText.trim().length > 20
    );

    if (uploadOpinionAutoExtract && readableAdded.length > 0) {
      setUploadingOpinionStage(
        'AI izdvaja pojedinačne primjedbe po člancima i sastavlja prijedloge odgovora...'
      );
      const extractRes = await extractPrimjedbeFromDocsAction({
        projectId: project.id,
        docIds: readableAdded.map((d) => d.id),
        modelPreference: uploadOpinionModel,
      });
      setUploadingOpinionStage(null);

      if (extractRes.error) {
        setUploadOpinionOpen(false);
        setUploadOpinionFiles([]);
        setFeedback({
          type: 'err',
          text: `Dokument je spremljen u projekt (${
            uploadRes.ocrCount ? 'AI OCR dovršen' : 'tekst pročitan'
          }), ali AI izdvajanje primjedbi nije uspjelo: ${extractRes.error}`,
        });
        return;
      }

      if (extractRes.primjedbe) {
        onPrimjedbeChange(extractRes.primjedbe);
        // Automatski otvori novododane primjedbe u harmonici da ih korisnik odmah vidi
        const newlyAdded = extractRes.primjedbe.filter((p) => !prevIds.has(p.id));
        if (newlyAdded.length > 0) {
          setExpandedItems((prev) => {
            const next = new Set(prev);
            newlyAdded.forEach((p) => next.add(p.id));
            return next;
          });
        }
      }

      setUploadOpinionOpen(false);
      setUploadOpinionFiles([]);
      setUploadOpinionSender('');
      setFeedback({
        type: 'ok',
        text: `Učitano ${uploadRes.added.length} mišljenje${
          uploadRes.ocrCount && uploadRes.ocrCount > 0 ? ' (skenirani PDF pročitan AI OCR-om)' : ''
        } i izdvojeno ${extractRes.extractedCount} strukturiranih primjedbi po člancima s prijedlozima odgovora.`,
      });
      return;
    }

    setUploadingOpinionStage(null);
    setUploadOpinionOpen(false);
    setUploadOpinionFiles([]);
    setUploadOpinionSender('');
    setFeedback({
      type: readableAdded.length > 0 ? 'ok' : 'err',
      text:
        readableAdded.length > 0
          ? `Učitano ${uploadRes.added.length} mišljenje u projekt${
              uploadRes.ocrCount ? ' (AI OCR dovršen)' : ''
            }. Sada ga možete odabrati pod „AI izdvoji iz mišljenja”.`
          : `Dokument je spremljen, ali je skeniran bez čitljivog teksta${
              uploadRes.errors?.length ? `: ${uploadRes.errors.join(' | ')}` : '.'
            }`,
    });
  };

  const handleRunAiExtract = async () => {
    if (selectedOpinionIds.size === 0) return;
    setExtracting(true);
    setFeedback(null);
    const prevIds = new Set(primjedbe.map((p) => p.id));
    const res = await extractPrimjedbeFromDocsAction({
      projectId: project.id,
      docIds: Array.from(selectedOpinionIds),
      modelPreference: extractModel,
    });
    setExtracting(false);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    if (res.primjedbe) {
      onPrimjedbeChange(res.primjedbe);
      const newlyAdded = res.primjedbe.filter((p) => !prevIds.has(p.id));
      if (newlyAdded.length > 0) {
        setExpandedItems((prev) => {
          const next = new Set(prev);
          newlyAdded.forEach((p) => next.add(p.id));
          return next;
        });
      }
    }
    setAiExtractOpen(false);
    setFeedback({
      type: 'ok',
      text: `AI je uspješno izdvojio ${res.extractedCount} strukturiranih primjedbi po člancima s prijedlozima odgovora.`,
    });
  };

  const handleImportExistingDocx = async () => {
    if (!selectedTableDocId) return;
    setImportingDocx(true);
    setFeedback(null);
    const res = await importExistingPrimjedbeDocxAction(project.id, selectedTableDocId, {
      smartAiSplit,
      skipEmptyRows,
    });
    setImportingDocx(false);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
    setDocxImportOpen(false);
    const details: string[] = [];
    if (res.splitMegaRowsCount && res.splitMegaRowsCount > 0) {
      details.push(`automatski razvrstano ${res.splitMegaRowsCount} spojenih redaka po člancima`);
    }
    if (res.skippedEmptyCount && res.skippedEmptyCount > 0) {
      details.push(`preskočeno ${res.skippedEmptyCount} praznih redaka`);
    }
    setFeedback({
      type: 'ok',
      text: `Uvezeno ${res.importedCount} primjedbi iz Word tablice${
        details.length > 0 ? ` (${details.join(', ')})` : ''
      }.`,
    });
  };

  const handleSplitCombined = async (item: PrimjedbaItem) => {
    setSplittingId(item.id);
    setFeedback(null);
    const prevIds = new Set(primjedbe.map((p) => p.id));
    const res = await splitCombinedPrimjedbaAction({
      projectId: project.id,
      primjedbaId: item.id,
    });
    setSplittingId(null);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    if (res.primjedbe) {
      onPrimjedbeChange(res.primjedbe);
      const newlyAdded = res.primjedbe.filter((p) => !prevIds.has(p.id));
      if (newlyAdded.length > 0) {
        setExpandedItems((prev) => {
          const next = new Set(prev);
          newlyAdded.forEach((p) => next.add(p.id));
          return next;
        });
      }
    }
    setFeedback({
      type: 'ok',
      text: `Unos „${item.tijelo}” je uspješno razvrstan u ${res.splitCount} zasebnih primjedbi po člancima s 1-na-1 uparenim statusima i odgovorima.`,
    });
  };

  const handleSuggestSingle = async (item: PrimjedbaItem) => {
    setSuggestingId(item.id);
    setFeedback(null);
    const res = await suggestSinglePrimjedbaResponseAction({
      projectId: project.id,
      primjedbaId: item.id,
      zeljeniStatus: item.status === 'Na razmatranju' ? undefined : item.status,
    });
    setSuggestingId(null);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    if (res.primjedbe) {
      onPrimjedbeChange(res.primjedbe);
      setExpandedItems((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    }
    setFeedback({
      type: 'ok',
      text: `Generiran AI prijedlog pravnog odgovora za primjedbu (${item.tijelo} — ${item.clanakOznaka}).`,
    });
  };

  const handleQuickStatusChange = async (item: PrimjedbaItem, nextStatus: PrimjedbaStatus) => {
    const res = await upsertPrimjedbaAction(project.id, {
      ...item,
      status: nextStatus,
    });
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
  };

  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    setSavingItem(true);
    const res = await upsertPrimjedbaAction(project.id, {
      id: editModal.id,
      tijelo: editModal.tijelo.trim() || 'Nepoznato tijelo',
      kategorijaTijela: editModal.kategorijaTijela,
      clanakOznaka: editModal.clanakOznaka.trim() || 'Opće primjedbe',
      tekstPrimjedbe: editModal.tekstPrimjedbe.trim(),
      status: editModal.status,
      obrazlozenje: editModal.obrazlozenje.trim(),
      predlozenaIzmjena: editModal.predlozenaIzmjena.trim() || undefined,
      pravnaReferenca: editModal.pravnaReferenca.trim() || undefined,
    });
    setSavingItem(false);
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
    setEditModal(null);
  };

  const handleDeleteItem = async (id: string) => {
    const res = await deletePrimjedbaAction(project.id, id);
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
  };

  const handleClearAll = async () => {
    if (!confirm('Obrisati SVE unose iz Tablice primjedbi ovog projekta?')) return;
    await clearAllPrimjedbeAction(project.id);
    onPrimjedbeChange([]);
  };

  const handleExportDocx = async () => {
    if (filtered.length === 0) return;
    setExportingDocx(true);
    try {
      const res = await fetch('/api/izrada-propisa/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'tablica_primjedbi',
          projectName: project.naziv,
          puniNazivAkta: project.puniNazivAkta,
          fazaPostupka: project.fazaPostupka,
          includeClanakColumn: includeClanakCol,
          items: grouped.flatMap(([, list]) => list),
        }),
      });
      if (!res.ok) throw new Error('Greška pri generiranju .docx dokumenta.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tablica_primjedbi_${project.naziv.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Greška pri izvozu.' });
    } finally {
      setExportingDocx(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
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
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Statistika + glavne akcije */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
              Ukupno: {stats.ukupno}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
              Prihvaćeno: {stats.prihvaceno}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
              Djelomično: {stats.djelomicno}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-800">
              Odbijeno: {stats.odbijeno}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-800">
              Na znanje: {stats.znanje}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
              Na razmatranju: {stats.razmatranje}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUploadOpinionFiles([]);
                setUploadOpinionSender('');
                setUploadOpinionOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Učitaj mišljenje (PDF/DOCX)
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedOpinionIds(new Set(opinionDocs.map((d) => d.id)));
                setAiExtractOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI izdvoji iz mišljenja ({opinionDocs.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedTableDocId(candidateTableDocs[0]?.id || '');
                setDocxImportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Uvezi Word tablicu
            </button>

            <button
              type="button"
              onClick={() =>
                setEditModal({
                  tijelo: '',
                  kategorijaTijela: 'TDU',
                  clanakOznaka: 'Članak 1.',
                  tekstPrimjedbe: '',
                  status: 'Na razmatranju',
                  obrazlozenje: '',
                  predlozenaIzmjena: '',
                  pravnaReferenca: '',
                })
              }
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Ručni unos
            </button>

            <button
              type="button"
              disabled={filtered.length === 0 || exportingDocx}
              onClick={handleExportDocx}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {exportingDocx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Izvezi .docx
            </button>
          </div>
        </div>

        {/* Filtri i grupiranje */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setGroupBy('clanak')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  groupBy === 'clanak'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Po člancima
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('tijelo')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  groupBy === 'tijelo'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Po tijelima (TDU/UZZ)
              </button>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'sve' | PrimjedbaStatus)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="sve">Svi statusi</option>
              {PRIMJEDBA_STATUSI.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={tijeloFilter}
              onChange={(e) => setTijeloFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 max-w-52"
            >
              <option value="sve">Sva tijela / dionici</option>
              {uniqueBodies.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setOnlySubstantive((prev) => !prev)}
              title="Sakrij prazne unose i tijela koja su odgovorila 'Nema primjedbi'"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                onlySubstantive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Samo konkretne ({substantiveCount}/{primjedbe.length})
            </button>

            {filtered.length > 0 && (
              <button
                type="button"
                onClick={handleToggleExpandAll}
                title="Otvori ili zatvori sve primjedbe i odgovore u harmonici"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                {allVisibleItemsExpanded ? 'Zatvori sve' : 'Otvori sve'}
              </button>
            )}

            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={includeClanakCol}
                onChange={(e) => setIncludeClanakCol(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Stupac „Članak” u .docx
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Traži primjedbu ili odgovor..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              />
            </div>

            {primjedbe.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                title="Isprazni cijelu tablicu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grupirani harmonika (accordion) prikaz primjedbi */}
      {grouped.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tablica primjedbi je prazna.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Možete izravno učitati novo PDF/DOCX mišljenje (uključujući skenirane PDF-ove s automatskim AI OCR-om), izdvojiti primjedbe iz već učitanih mišljenja ili uvesti postojeću Word tablicu primjedbi.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([groupTitle, items]) => {
            const isGroupCollapsed = collapsedGroups.has(groupTitle);
            const groupPrih = items.filter((i) => i.status === 'Prihvaća se').length;
            const groupDjel = items.filter((i) => i.status === 'Djelomično se prihvaća').length;
            const groupOdb = items.filter((i) => i.status === 'Ne prihvaća se').length;
            const groupZnanje = items.filter((i) => i.status === 'Prima se na znanje').length;
            const allInGroupOpen = items.every((i) => expandedItems.has(i.id));

            return (
              <div
                key={groupTitle}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs"
              >
                {/* Zaglavlje grupe (razina 1 harmonike) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(groupTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleGroup(groupTitle);
                    }
                  }}
                  className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {isGroupCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                      {groupTitle}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {items.length} {items.length === 1 ? 'primjedba' : 'primjedbi'}
                    </span>
                    {groupPrih > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800">
                        {groupPrih} prihvaćeno
                      </span>
                    )}
                    {groupDjel > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
                        {groupDjel} djelomično
                      </span>
                    )}
                    {groupOdb > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800">
                        {groupOdb} odbijeno
                      </span>
                    )}
                    {groupZnanje > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800">
                        {groupZnanje} na znanje
                      </span>
                    )}
                  </div>

                  {!isGroupCollapsed && items.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAllItemsInGroup(items);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100/70 dark:hover:bg-blue-950/60 cursor-pointer"
                    >
                      <ChevronsUpDown className="w-3 h-3" />
                      {allInGroupOpen ? 'Sažmi stavke' : 'Otvori sve stavke'}
                    </button>
                  )}
                </div>

                {/* Lista harmonika stavki unutar grupe (razina 2 harmonike) */}
                {!isGroupCollapsed && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const isOpen = expandedItems.has(item.id);
                      const showSplitBtn = canSplitCombinedItem(item);
                      const showCombinedBanner =
                        item.tekstPrimjedbe.length > 900 && item.obrazlozenje.length > 400;
                      const hasAnswer = item.obrazlozenje.trim().length > 0;

                      return (
                        <div
                          key={item.id}
                          className={`transition-colors ${
                            isOpen ? 'bg-blue-50/20 dark:bg-blue-950/15' : ''
                          }`}
                        >
                          {/* Klikabilna harmonika traka pojedinačne primjedbe */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleItem(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleItem(item.id);
                              }
                            }}
                            className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {isOpen ? (
                                <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                              )}

                              {items.length > 1 && (
                                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                                  #{idx + 1}
                                </span>
                              )}

                              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                                {item.clanakOznaka}
                              </span>

                              {groupBy === 'clanak' && (
                                <span className="text-xs font-bold text-slate-900 dark:text-white shrink-0 max-w-52 truncate">
                                  {item.tijelo}
                                </span>
                              )}

                              <span className="text-xs text-slate-600 dark:text-slate-300 truncate min-w-0">
                                {getRemarkPreview(item.tekstPrimjedbe)}
                              </span>
                            </div>

                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {hasAnswer && (
                                <span
                                  title="Upisan odgovor / obrazloženje Ministarstva"
                                  className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800"
                                >
                                  <MessageSquare className="w-2.5 h-2.5" />
                                  Odgovor
                                </span>
                              )}

                              <select
                                value={item.status}
                                onChange={(e) =>
                                  handleQuickStatusChange(item, e.target.value as PrimjedbaStatus)
                                }
                                className={`px-2 py-1 text-[11px] font-bold rounded-lg border cursor-pointer ${
                                  STATUS_BADGE[item.status]
                                }`}
                              >
                                {PRIMJEDBA_STATUSI.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Otvoreni sadržaj harmonike: cijela primjedba + cijeli odgovor + akcije */}
                          {isOpen && (
                            <div className="px-4 pb-4 pt-2 space-y-2.5 border-t border-slate-100 dark:border-slate-800/80">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {item.tijelo}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                    {item.kategorijaTijela}
                                  </span>
                                  {item.izvorniDokumentNaziv && (
                                    <span className="truncate max-w-xs" title={item.izvorniDokumentNaziv}>
                                      Izvor: {item.izvorniDokumentNaziv}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {showSplitBtn && (
                                    <button
                                      type="button"
                                      disabled={splittingId === item.id || suggestingId === item.id}
                                      onClick={() => handleSplitCombined(item)}
                                      title="Automatski razdvoji spojeni unos na pojedinačne primjedbe po člancima i 1-na-1 upari postojeće odgovore"
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      {splittingId === item.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Scissors className="w-3 h-3" />
                                      )}
                                      {splittingId === item.id
                                        ? 'Razvrstavam...'
                                        : 'Razvrstaj po člancima'}
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={suggestingId === item.id || splittingId === item.id}
                                    onClick={() => handleSuggestSingle(item)}
                                    title="Generiraj ili doradi pravni odgovor uz Bazu prakse i Bazu zakona"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                  >
                                    {suggestingId === item.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Wand2 className="w-3 h-3" />
                                    )}
                                    AI odgovor
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditModal({
                                        id: item.id,
                                        tijelo: item.tijelo,
                                        kategorijaTijela: item.kategorijaTijela,
                                        clanakOznaka: item.clanakOznaka,
                                        tekstPrimjedbe: item.tekstPrimjedbe,
                                        status: item.status,
                                        obrazlozenje: item.obrazlozenje,
                                        predlozenaIzmjena: item.predlozenaIzmjena || '',
                                        pravnaReferenca: item.pravnaReferenca || '',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Uredi
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item.id)}
                                    title="Obriši stavku"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {showCombinedBanner && (
                                <div className="px-3 py-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-900 dark:text-amber-200">
                                  Ovaj unos sadrži više spojenih primjedbi i odgovora iz jedne ćelije Word tablice. Kliknite{' '}
                                  <strong>„Razvrstaj po člancima”</strong> da se svaka primjedba automatski odvoji i upari sa svojim točnim statusom i odgovorom.
                                </div>
                              )}

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Primjedba / Mišljenje
                                  </div>
                                  <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                                    {item.tekstPrimjedbe}
                                  </p>
                                </div>

                                <div className="p-3 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/60 space-y-1.5">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                                    Obrazloženje / Prijedlog odgovora
                                  </div>
                                  <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                                    {item.obrazlozenje || (
                                      <span className="italic text-slate-400">
                                        {item.status === 'Prima se na znanje'
                                          ? 'Nije potreban poseban odgovor (primljeno na znanje / bez primjedbi).'
                                          : 'Još nije upisan odgovor — kliknite „AI odgovor” ili „Uredi”.'}
                                      </span>
                                    )}
                                  </p>
                                  {item.predlozenaIzmjena && (
                                    <div className="pt-1.5 mt-1.5 border-t border-blue-200/60 dark:border-blue-800/60 text-[11px] text-emerald-800 dark:text-emerald-300">
                                      <strong>Prijedlog izmjene teksta:</strong>{' '}
                                      {item.predlozenaIzmjena}
                                    </div>
                                  )}
                                  {item.pravnaReferenca && (
                                    <div className="text-[10.5px] text-indigo-700 dark:text-indigo-300 font-medium">
                                      Pravna osnova / praksa: {item.pravnaReferenca}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Izravni upload novog mišljenja (PDF/DOCX) + AI OCR + automatsko izdvajanje primjedbi */}
      {uploadOpinionOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !uploadingOpinionStage && setUploadOpinionOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-teal-600" />
                Učitaj novo mišljenje (PDF / DOCX) izravno u primjedbe
              </h3>
              <button
                type="button"
                disabled={Boolean(uploadingOpinionStage)}
                onClick={() => setUploadOpinionOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setUploadOpinionDrag(true);
              }}
              onDragLeave={() => setUploadOpinionDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setUploadOpinionDrag(false);
                if (e.dataTransfer.files?.length) {
                  setUploadOpinionFiles(Array.from(e.dataTransfer.files));
                }
              }}
              onClick={() => !uploadingOpinionStage && opinionFileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
                uploadOpinionDrag
                  ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30'
                  : 'border-slate-300 dark:border-slate-700 hover:border-teal-400 bg-slate-50/60 dark:bg-slate-950/40'
              }`}
            >
              <input
                ref={opinionFileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    setUploadOpinionFiles(Array.from(e.target.files));
                  }
                }}
              />
              <UploadCloud className="w-7 h-7 text-teal-600 mx-auto mb-2" />
              {uploadOpinionFiles.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Odabrano datoteka: {uploadOpinionFiles.length}
                  </p>
                  <div className="text-[11px] text-teal-700 dark:text-teal-300 font-medium space-y-0.5">
                    {uploadOpinionFiles.map((f) => (
                      <div key={f.name} className="truncate">
                        {f.name} ({(f.size / 1024).toFixed(0)} KB)
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Povucite PDF/DOCX mišljenje ovdje ili kliknite za odabir s računala
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Podržani i skenirani PDF-ovi bez tekstualnog sloja (automatski AI OCR radi i na web verziji).
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tijelo / pošiljatelj (opcionalno — automatski se prepoznaje iz teksta)
                </label>
                <input
                  type="text"
                  value={uploadOpinionSender}
                  onChange={(e) => setUploadOpinionSender(e.target.value)}
                  placeholder="npr. Ministarstvo mora, prometa i infrastrukture"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800/70 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadOpinionAutoOcr}
                  onChange={(e) => setUploadOpinionAutoOcr(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-teal-600"
                />
                <span className="text-slate-700 dark:text-slate-200 leading-relaxed">
                  <strong>Automatski AI OCR ako je PDF skeniran</strong>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Ako PDF nema ugrađeni tekst, Gemini odmah čita sliku stranica u memoriji (radi i na Vercelu).
                  </span>
                </span>
              </label>

              <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/70 space-y-2">
                <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadOpinionAutoExtract}
                    onChange={(e) => setUploadOpinionAutoExtract(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    <strong>Odmah izdvoji svaku primjedbu po člancima i predloži odgovore (AI)</strong>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Dokument se sprema u „Dokumenti i Nacrt”, a sve jezične/nomotehničke/sadržajne primjedbe odmah ulaze u Tablicu primjedbi.
                    </span>
                  </span>
                </label>

                {uploadOpinionAutoExtract && (
                  <div className="pl-6 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      AI model:
                    </span>
                    <select
                      value={uploadOpinionModel}
                      onChange={(e) => setUploadOpinionModel(e.target.value as 'flash' | 'pro')}
                      className="px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                    >
                      <option value="flash">Gemini Flash (brzo)</option>
                      <option value="pro">Gemini Pro (najtemeljitije)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {uploadingOpinionStage && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2 font-medium">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                {uploadingOpinionStage}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={Boolean(uploadingOpinionStage)}
                onClick={() => setUploadOpinionOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer disabled:opacity-40"
              >
                Odustani
              </button>
              <button
                type="button"
                disabled={Boolean(uploadingOpinionStage) || uploadOpinionFiles.length === 0}
                onClick={handleDirectOpinionUpload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {uploadingOpinionStage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                {uploadOpinionAutoExtract ? 'Učitaj i izdvoji primjedbe' : 'Samo učitaj mišljenje'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AI izdvajanje primjedbi iz učitanih mišljenja */}
      {aiExtractOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setAiExtractOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                AI izdvajanje primjedbi po člancima + prijedlozi odgovora
              </h3>
              <button
                type="button"
                onClick={() => setAiExtractOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {scannedOpinionDocs.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11.5px] text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Imate <strong>{scannedOpinionDocs.length}</strong> skeniranih PDF mišljenja bez pročitanog teksta ({scannedOpinionDocs.map((d) => d.prikazniNaziv).slice(0, 2).join(', ')}). Pokrenite AI OCR u kartici „Dokumenti i Nacrt” ili ih učitajte izravno gumbom <strong>„Učitaj mišljenje (PDF/DOCX)”</strong>.
                  </span>
                </div>
              )}
              {opinionDocs.length === 0 ? (
                <p className="text-xs text-slate-500">
                  U projektu još nema učitanih dokumenata s ulogom <strong>Mišljenja TDU/UZZ/dionika</strong>. Učitajte ih najprije u kartici „Dokumenti i Nacrt”.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Odaberite mišljenja za analizu ({selectedOpinionIds.size}/{opinionDocs.length}):
                    </span>
                    <select
                      value={extractModel}
                      onChange={(e) => setExtractModel(e.target.value as 'flash' | 'pro')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                    >
                      <option value="flash">Gemini Flash (brzo)</option>
                      <option value="pro">Gemini Pro (najtemeljitije)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    {opinionDocs.map((doc) => {
                      const checked = selectedOpinionIds.has(doc.id);
                      return (
                        <label
                          key={doc.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer ${
                            checked
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(selectedOpinionIds);
                              if (e.target.checked) next.add(doc.id);
                              else next.delete(doc.id);
                              setSelectedOpinionIds(next);
                            }}
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 dark:text-white truncate">
                              {doc.prikazniNaziv}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {doc.posiljatelj || 'Pošiljatelj će se prepoznati iz teksta'} ·{' '}
                              {doc.rawText.length.toLocaleString('hr-HR')} znakova
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAiExtractOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Odustani
              </button>
              <button
                type="button"
                disabled={extracting || selectedOpinionIds.size === 0}
                onClick={handleRunAiExtract}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {extracting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {extracting ? 'Izdvajam primjedbe...' : 'Pokreni AI izdvajanje'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Uvoz postojeće Word tablice primjedbi */}
      {docxImportOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setDocxImportOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Uvoz postojeće Word tablice primjedbi
              </h3>
              <button
                type="button"
                onClick={() => setDocxImportOpen(false)}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {candidateTableDocs.length === 0 ? (
              <p className="text-xs text-slate-500">
                U projektu još nema učitane Word tablice primjedbi (npr. <code>3. Tablica sa zaprimljenim primjedbama...FINAL.docx</code>). Uvezite je u kartici „Dokumenti i Nacrt”.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Odaberite dokument s tablicom primjedbi:
                  </label>
                  <select
                    value={selectedTableDocId}
                    onChange={(e) => setSelectedTableDocId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                  >
                    {candidateTableDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.prikazniNaziv} (.{d.ekstenzija})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smartAiSplit}
                    onChange={(e) => setSmartAiSplit(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600"
                  />
                  <span className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    <strong>Pametno razvrstaj spojene retke po člancima i upari odgovore (AI)</strong>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Ako je više primjedbi i odgovora istog tijela u jednoj ćeliji (npr. Udruga gradova, UZZ, MMPI), AI ih automatski razdvaja po člancima bez gubitka teksta. Isključite za 100% lokalni uvoz (0 AI).
                    </span>
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer px-1">
                  <input
                    type="checkbox"
                    checked={skipEmptyRows}
                    onChange={(e) => setSkipEmptyRows(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  Preskoči prazne retke (tijela koja još nisu dostavila mišljenje)
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDocxImportOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Odustani
              </button>
              <button
                type="button"
                disabled={importingDocx || !selectedTableDocId}
                onClick={handleImportExistingDocx}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {importingDocx ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {importingDocx
                  ? smartAiSplit
                    ? 'Uvozim i razvrstavam...'
                    : 'Uvozim...'
                  : smartAiSplit
                    ? 'Uvezi i razvrstaj'
                    : 'Uvezi lokalno (0 AI)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ručni unos / uređivanje primjedbe */}
      {editModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setEditModal(null)}
        >
          <form
            onSubmit={handleSaveEditModal}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editModal.id ? 'Uredi primjedbu i odgovor' : 'Nova primjedba u tablici'}
              </h3>
              <button type="button" onClick={() => setEditModal(null)} className="cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tijelo / dionik *
                </label>
                <input
                  type="text"
                  required
                  value={editModal.tijelo}
                  onChange={(e) => setEditModal({ ...editModal, tijelo: e.target.value })}
                  placeholder="npr. Ured za zakonodavstvo Vlade RH"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Kategorija
                </label>
                <select
                  value={editModal.kategorijaTijela}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      kategorijaTijela: e.target.value as PrimjedbaKategorijaTijela,
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {PRIMJEDBA_KATEGORIJE_TIJELA.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Članak / odredba
                </label>
                <input
                  type="text"
                  value={editModal.clanakOznaka}
                  onChange={(e) => setEditModal({ ...editModal, clanakOznaka: e.target.value })}
                  placeholder="npr. Članak 5. st. 2."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Prihvaćenost primjedbe
                </label>
                <select
                  value={editModal.status}
                  onChange={(e) =>
                    setEditModal({ ...editModal, status: e.target.value as PrimjedbaStatus })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {PRIMJEDBA_STATUSI.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Tekst primjedbe / mišljenja *
              </label>
              <textarea
                rows={4}
                required
                value={editModal.tekstPrimjedbe}
                onChange={(e) => setEditModal({ ...editModal, tekstPrimjedbe: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Obrazloženje (službeni odgovor Ministarstva)
              </label>
              <textarea
                rows={4}
                value={editModal.obrazlozenje}
                onChange={(e) => setEditModal({ ...editModal, obrazlozenje: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Prijedlog izmijenjenog teksta članka (opcionalno)
              </label>
              <textarea
                rows={2}
                value={editModal.predlozenaIzmjena}
                onChange={(e) =>
                  setEditModal({ ...editModal, predlozenaIzmjena: e.target.value })
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={savingItem}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {savingItem && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Spremi stavku
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
