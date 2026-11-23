'use client';

import React, { useState, useMemo } from 'react';
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
import {
  extractPrimjedbeFromDocsAction,
  importExistingPrimjedbeDocxAction,
  suggestSinglePrimjedbaResponseAction,
  upsertPrimjedbaAction,
  deletePrimjedbaAction,
  clearAllPrimjedbeAction,
} from '@/app/actions/izradaPropisaPrimjedbeActions';
import { articleSortRank } from '@/lib/propis-article-parser';

interface PrimjedbeTabProps {
  project: PropisProject;
  documents: PropisDocument[];
  primjedbe: PrimjedbaItem[];
  onPrimjedbeChange: (items: PrimjedbaItem[]) => void;
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
}: PrimjedbeTabProps) {
  const [groupBy, setGroupBy] = useState<'clanak' | 'tijelo'>('clanak');
  const [statusFilter, setStatusFilter] = useState<'sve' | PrimjedbaStatus>('sve');
  const [tijeloFilter, setTijeloFilter] = useState<string>('sve');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal: AI izdvajanje iz mišljenja
  const [aiExtractOpen, setAiExtractOpen] = useState(false);
  const [selectedOpinionIds, setSelectedOpinionIds] = useState<Set<string>>(new Set());
  const [extractModel, setExtractModel] = useState<'flash' | 'pro'>('flash');
  const [extracting, setExtracting] = useState(false);

  // Modal: Lokalni uvoz Word tablice (0 AI troška)
  const [docxImportOpen, setDocxImportOpen] = useState(false);
  const [selectedTableDocId, setSelectedTableDocId] = useState('');
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

  // Per-row AI prijedlog odgovora
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [includeClanakCol, setIncludeClanakCol] = useState(true);

  const opinionDocs = useMemo(
    () => documents.filter((d) => d.uloga === 'misljenje' && !d.needsOcr),
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return primjedbe.filter((p) => {
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
  }, [primjedbe, statusFilter, tijeloFilter, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, PrimjedbaItem[]>();
    for (const item of filtered) {
      const key = groupBy === 'clanak' ? item.clanakOznaka || 'Opće primjedbe' : item.tijelo;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    const entries = Array.from(map.entries());
    if (groupBy === 'clanak') {
      entries.sort((a, b) => articleSortRank(a[0]) - articleSortRank(b[0]));
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0], 'hr'));
    }
    return entries;
  }, [filtered, groupBy]);

  const handleRunAiExtract = async () => {
    if (selectedOpinionIds.size === 0) return;
    setExtracting(true);
    setFeedback(null);
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
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
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
    const res = await importExistingPrimjedbeDocxAction(project.id, selectedTableDocId);
    setImportingDocx(false);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
    setDocxImportOpen(false);
    setFeedback({
      type: 'ok',
      text: `Lokalno uvezeno ${res.importedCount} primjedbi iz Word tablice (0 AI troška).`,
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
    if (res.primjedbe) onPrimjedbeChange(res.primjedbe);
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
          items: filtered,
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
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
              Na razmatranju: {stats.razmatranje}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              Uvezi Word tablicu (0 AI)
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

      {/* Grupirani prikaz primjedbi */}
      {grouped.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center space-y-2">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tablica primjedbi je prazna.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Možete automatski izdvojiti primjedbe po člancima iz učitanih PDF/DOC mišljenja (UZZ, MFIN, MINGO, Udruga gradova…) ili jednim klikom lokalno uvesti postojeću Word tablicu primjedbi (0 AI troška).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupTitle, items]) => (
            <div
              key={groupTitle}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs"
            >
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                  {groupTitle}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {items.length} {items.length === 1 ? 'primjedba' : 'primjedbi'}
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => (
                  <div key={item.id} className="p-4 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {item.tijelo}
                        </span>
                        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {item.clanakOznaka}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {item.kategorijaTijela}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
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

                        <button
                          type="button"
                          disabled={suggestingId === item.id}
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
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

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
                              Još nije upisan odgovor — kliknite „AI odgovor” ili „Uredi”.
                            </span>
                          )}
                        </p>
                        {item.predlozenaIzmjena && (
                          <div className="pt-1.5 mt-1.5 border-t border-blue-200/60 dark:border-blue-800/60 text-[11px] text-emerald-800 dark:text-emerald-300">
                            <strong>Prijedlog izmjene teksta:</strong> {item.predlozenaIzmjena}
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
                ))}
              </div>
            </div>
          ))}
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

      {/* MODAL: Lokalni uvoz postojeće Word tablice primjedbi (0 AI troška) */}
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
                Lokalni uvoz postojeće Word tablice (0 AI troška)
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
              <div className="space-y-2">
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
                Uvezi lokalno
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
