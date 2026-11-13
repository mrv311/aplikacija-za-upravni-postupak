'use client';

import React, { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Search,
  Inbox,
  AlertCircle,
  Loader2,
  Trash2,
  Pencil,
  Clock,
  FileText,
  CheckCircle2,
  X,
  Landmark,
  AlertTriangle,
  Users,
  UserCheck,
  Stamp,
  Plus,
  Send,
  RotateCcw,
} from 'lucide-react';
import {
  archivePredmet,
  unarchivePredmet,
  updatePredmet,
  updatePredmetFaza,
  deletePredmet,
  deleteMultiplePredmeti,
  getSluzbeniciAction,
} from '@/app/actions/predmetActions';
import {
  type EnrichedPredmet,
  type PredmetFaza,
  type PredmetIshod,
  type PredmetPodrucje,
  type Sluzbenik,
  PREDMET_PODRUCJA,
  PREDMET_FAZE,
  PREDMET_ISHODI,
  PARAF_STATUSI,
  calculateZupDeadline,
  formatIsoDateHr,
  getInitials,
} from '@/lib/predmet-meta';
import { getStatusBadge } from './StatusBadge';
import { SluzbeniciModal } from './SluzbeniciModal';
import { ParafiranjeModal } from './ParafiranjeModal';
import { NadlezniPostupakModal } from './NadlezniPostupakModal';

export { getStatusBadge };
export type Predmet = EnrichedPredmet;

interface PredmetiTableProps {
  initialPredmeti: EnrichedPredmet[];
  type: 'aktivni' | 'arhiva';
}

export default function PredmetiTable({ initialPredmeti, type }: PredmetiTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<EnrichedPredmet[]>(initialPredmeti);
  const [search, setSearch] = useState('');
  const [filterPodrucje, setFilterPodrucje] = useState<string>('sve');
  const [filterSecondary, setFilterSecondary] = useState<string>('sve'); // faza u aktivnima ili ishod u arhivi
  const [filterSluzbenik, setFilterSluzbenik] = useState<string>('sve');
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [sortBy, setSortBy] = useState<'datum' | 'datum_stari' | 'hitnost' | 'stranka'>('datum');

  // Službenici & Parafiranje modali
  const [sluzbenici, setSluzbenici] = useState<Sluzbenik[]>([]);
  const [sluzbeniciModalOpen, setSluzbeniciModalOpen] = useState(false);
  const [parafModalItem, setParafModalItem] = useState<EnrichedPredmet | null>(null);
  const [parafModalTab, setParafModalTab] = useState<'paraf' | 'delegiranje'>('paraf');
  const [nadlezniModalItem, setNadlezniModalItem] = useState<EnrichedPredmet | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );
  const [, startTransition] = useTransition();

  // Modali za Uredi, Arhiviraj i Obriši
  const [editingItem, setEditingItem] = useState<EnrichedPredmet | null>(null);
  const [archivingItem, setArchivingItem] = useState<EnrichedPredmet | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Polja za Arhiviranje
  const [archiveIshod, setArchiveIshod] = useState<PredmetIshod>('Odbijena žalba');
  const [archiveNapomena, setArchiveNapomena] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSluzbeniciAction().then(setSluzbenici);
    const handleSluzbeniciUpdated = (e: Event) => {
      const custom = e as CustomEvent<Sluzbenik[]>;
      if (custom.detail) setSluzbenici(custom.detail);
      else getSluzbeniciAction().then(setSluzbenici);
    };
    window.addEventListener('sluzbenici-updated', handleSluzbeniciUpdated);
    return () => window.removeEventListener('sluzbenici-updated', handleSluzbeniciUpdated);
  }, []);

  // Prečac na tipkovnici: Ctrl+K ili / za fokus tražilice
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setItems(initialPredmeti);
    setSelectedIds((prev) => {
      const validIds = new Set(initialPredmeti.map((p) => p.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [initialPredmeti]);

  // Statistike za brze kartice na vrhu
  const stats = useMemo(() => {
    let urgentCount = 0;
    let cekaDopunuCount = 0;
    let naPotpisuCount = 0;
    let odbijeneCount = 0;
    let ponistenaCount = 0;
    let uPraksiCount = 0;

    for (const p of items) {
      if (type === 'aktivni') {
        const dl = calculateZupDeadline(p.datum_predaje_zalbe);
        if (dl && (dl.urgency === 'overdue' || dl.urgency === 'warning')) urgentCount++;
        if (p.faza === 'Čeka dopunu') cekaDopunuCount++;
        if (p.faza === 'Na potpisu') naPotpisuCount++;
      } else {
        if (p.ishod === 'Odbijena žalba') odbijeneCount++;
        if (p.ishod === 'Poništeno rješenje') ponistenaCount++;
        if (p.poslano_u_praksu) uPraksiCount++;
      }
    }

    return {
      total: items.length,
      urgentCount,
      cekaDopunuCount,
      naPotpisuCount,
      odbijeneCount,
      ponistenaCount,
      uPraksiCount,
    };
  }, [items, type]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = items.filter((p) => {
      if (q) {
        const matchesSearch =
          p.klasa.toLowerCase().includes(q) ||
          p.urbroj.toLowerCase().includes(q) ||
          p.stranka.toLowerCase().includes(q) ||
          (p.napomena || '').toLowerCase().includes(q) ||
          (p.sluzbenik_ime || '').toLowerCase().includes(q) ||
          (p.uputa_voditelja || '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      if (filterPodrucje !== 'sve' && p.podrucje !== filterPodrucje) return false;

      if (filterSluzbenik !== 'sve') {
        if (filterSluzbenik === '__nerasporedjeno__') {
          if (p.sluzbenik_ime) return false;
        } else {
          const matchesSluzbenik =
            p.sluzbenik_id === filterSluzbenik ||
            p.sluzbenik_ime === filterSluzbenik;
          if (!matchesSluzbenik) return false;
        }
      }

      if (type === 'aktivni') {
        if (filterSecondary !== 'sve' && p.faza !== filterSecondary) return false;
        if (onlyUrgent) {
          const dl = calculateZupDeadline(p.datum_predaje_zalbe);
          if (!dl || dl.urgency === 'normal') return false;
        }
      } else {
        if (filterSecondary !== 'sve' && (p.ishod || 'Ostalo') !== filterSecondary) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'stranka') {
        return (a.stranka || '').localeCompare(b.stranka || '', 'hr');
      }
      if (sortBy === 'hitnost') {
        const da = calculateZupDeadline(a.datum_predaje_zalbe)?.daysRemaining ?? 999;
        const db = calculateZupDeadline(b.datum_predaje_zalbe)?.daysRemaining ?? 999;
        return da - db;
      }
      if (sortBy === 'datum_stari') {
        return (a.datum_zaprimanja || '').localeCompare(b.datum_zaprimanja || '');
      }
      // Najnoviji datum primitka prvi
      return (b.datum_zaprimanja || '').localeCompare(a.datum_zaprimanja || '');
    });

    return list;
  }, [items, search, filterPodrucje, filterSecondary, filterSluzbenik, onlyUrgent, sortBy, type]);

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (filteredItems.length === 0) return;
    const allSelected = filteredItems.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredItems.forEach((p) => next.delete(p.id));
      } else {
        filteredItems.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const handleFazaChange = async (id: string, novaFaza: PredmetFaza) => {
    const previous = [...items];
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, faza: novaFaza } : p)));
    const res = await updatePredmetFaza(id, novaFaza);
    if (res.error) {
      setItems(previous);
      setFeedback({ message: res.error, type: 'error' });
    } else {
      startTransition(() => router.refresh());
    }
  };

  const openArchiveModal = (item: EnrichedPredmet) => {
    setArchivingItem(item);
    setArchiveIshod(item.ishod || 'Odbijena žalba');
    setArchiveNapomena(item.napomena || '');
  };

  const handleConfirmArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivingItem) return;
    setModalLoading(true);
    setFeedback(null);

    const target = archivingItem;
    const res = await archivePredmet(target.id, {
      ishod: archiveIshod,
      napomena: archiveNapomena,
    });

    setModalLoading(false);
    if (res.error) {
      setFeedback({ message: res.error, type: 'error' });
    } else {
      setArchivingItem(null);
      setItems((prev) => prev.filter((p) => p.id !== target.id));
      setFeedback({
        message: `Predmet ${target.klasa} arhiviran je u A/A (${archiveIshod}).`,
        type: 'success',
      });
      startTransition(() => router.refresh());
    }
  };

  const handleUnarchive = async (item: EnrichedPredmet) => {
    setLoadingId(item.id);
    setFeedback(null);
    const res = await unarchivePredmet(item.id);
    setLoadingId(null);

    if (res.error) {
      setFeedback({ message: res.error, type: 'error' });
    } else {
      setItems((prev) => prev.filter((p) => p.id !== item.id));
      setFeedback({
        message: `Predmet ${item.klasa} vraćen je u aktivne predmete.`,
        type: 'success',
      });
      startTransition(() => router.refresh());
    }
  };

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setModalLoading(true);

    const res = await updatePredmet(editingItem.id, {
      klasa: editingItem.klasa,
      urbroj: editingItem.urbroj,
      stranka: editingItem.stranka,
      datum_zaprimanja: editingItem.datum_zaprimanja,
      datum_predaje_zalbe: editingItem.datum_predaje_zalbe || '',
      datum_predaje_zalbe_izvor: editingItem.datum_predaje_zalbe_izvor,
      podrucje: editingItem.podrucje,
      faza: editingItem.faza,
      ishod: editingItem.ishod,
      napomena: editingItem.napomena,
      sluzbenik_id: editingItem.sluzbenik_id,
      sluzbenik_ime: editingItem.sluzbenik_ime,
      interni_rok: editingItem.interni_rok,
      uputa_voditelja: editingItem.uputa_voditelja,
    });

    setModalLoading(false);
    if (res.error) {
      setFeedback({ message: res.error, type: 'error' });
    } else {
      setItems((prev) => prev.map((p) => (p.id === editingItem.id ? editingItem : p)));
      setEditingItem(null);
      setFeedback({ message: 'Podaci o predmetu su uspješno ažurirani.', type: 'success' });
      startTransition(() => router.refresh());
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingIds || deletingIds.length === 0) return;
    setModalLoading(true);
    setFeedback(null);

    const idsToRemove = [...deletingIds];
    const res =
      idsToRemove.length === 1
        ? await deletePredmet(idsToRemove[0])
        : await deleteMultiplePredmeti(idsToRemove);

    setModalLoading(false);
    if (res.error) {
      setFeedback({ message: res.error, type: 'error' });
    } else {
      const removedSet = new Set(idsToRemove);
      setItems((prev) => prev.filter((p) => !removedSet.has(p.id)));
      setSelectedIds(new Set());
      setDeletingIds(null);
      setFeedback({
        message:
          idsToRemove.length === 1
            ? 'Predmet i svi pripadajući skenovi u pohrani trajno su obrisani.'
            : `Uspješno je trajno obrisano ${idsToRemove.length} predmeta i njihove datoteke.`,
        type: 'success',
      });
      startTransition(() => router.refresh());
    }
  };

  const deletingItemsSummary = useMemo(() => {
    if (!deletingIds) return { count: 0, totalDocs: 0, sampleKlasa: '' };
    const targets = items.filter((p) => deletingIds.includes(p.id));
    const totalDocs = targets.reduce((acc, t) => acc + t.broj_dokumenata, 0);
    return {
      count: targets.length,
      totalDocs,
      sampleKlasa: targets[0]?.klasa || '',
      sampleStranka: targets[0]?.stranka || '',
    };
  }, [deletingIds, items]);

  return (
    <div className="space-y-5">
      {/* 1. BRZE STATISTIČKE KARTICE */}
      {type === 'aktivni' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setFilterSecondary('sve');
              setOnlyUrgent(false);
            }}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              filterSecondary === 'sve' && !onlyUrgent
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 shadow-2xs'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ukupno u radu</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setOnlyUrgent((v) => !v);
              setSortBy('hitnost');
            }}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              onlyUrgent
                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 shadow-2xs'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900'
            }`}
          >
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Blizu isteka / prekoračen rok
            </p>
            <p className="text-2xl font-bold text-rose-700 dark:text-rose-400 mt-1">{stats.urgentCount}</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setOnlyUrgent(false);
              setFilterSecondary(filterSecondary === 'Čeka dopunu' ? 'sve' : 'Čeka dopunu');
            }}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              filterSecondary === 'Čeka dopunu'
                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 shadow-2xs'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-900'
            }`}
          >
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Čeka dopunu spisa</p>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-400 mt-1">{stats.cekaDopunuCount}</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setOnlyUrgent(false);
              setFilterSecondary(filterSecondary === 'Na potpisu' ? 'sve' : 'Na potpisu');
            }}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              filterSecondary === 'Na potpisu'
                ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 shadow-2xs'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-200 dark:hover:border-purple-900'
            }`}
          >
            <p className="text-xs font-semibold text-purple-800 dark:text-purple-400">Nacrt na potpisu</p>
            <p className="text-2xl font-bold text-purple-800 dark:text-purple-400 mt-1">{stats.naPotpisuCount}</p>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ukupno u arhivi (A/A)</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Odbijene žalbe</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{stats.odbijeneCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">Poništena rješenja</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 mt-1">{stats.ponistenaCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Ugrađeno u Bazu prakse</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">{stats.uPraksiCount}</p>
          </div>
        </div>
      )}

      {/* Obavijest o statusu akcije */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-sm shadow-2xs ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <p className="font-medium text-xs sm:text-sm">{feedback.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-75"
          >
            Zatvori
          </button>
        </div>
      )}

      {/* 2. TRAŽILICA, FILTERI I SORTIRANJE */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po klasi, urbroju, stranci ili napomeni..."
            className="w-full pl-9 pr-14 py-2 bg-slate-50 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 pointer-events-none">
            Ctrl+K
          </kbd>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter po službeniku */}
          <select
            value={filterSluzbenik}
            onChange={(e) => setFilterSluzbenik(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="sve">Svi službenici</option>
            <option value="__nerasporedjeno__">Neraspoređeno / U mom radu</option>
            {sluzbenici.map((s) => (
              <option key={s.id} value={s.imePrezime}>
                Službenik: {s.imePrezime}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setSluzbeniciModalOpen(true)}
            title="Uredi popis službenika u odjelu"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Službenici</span>
          </button>

          <select
            value={filterPodrucje}
            onChange={(e) => setFilterPodrucje(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="sve">Sva područja</option>
            {PREDMET_PODRUCJA.map((p) => (
              <option key={p.value} value={p.value}>
                Područje: {p.label}
              </option>
            ))}
          </select>

          {type === 'aktivni' ? (
            <select
              value={filterSecondary}
              onChange={(e) => setFilterSecondary(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="sve">Sve radne faze</option>
              {PREDMET_FAZE.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={filterSecondary}
              onChange={(e) => setFilterSecondary(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="sve">Svi ishodi</option>
              {PREDMET_ISHODI.map((ish) => (
                <option key={ish.value} value={ish.value}>
                  {ish.value}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'datum' | 'datum_stari' | 'hitnost' | 'stranka')}
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="datum">Sortiraj: Najnoviji prvi</option>
            <option value="datum_stari">Sortiraj: Najstariji prvi</option>
            {type === 'aktivni' && <option value="hitnost">Sortiraj: ZUP rok (hitnost)</option>}
            <option value="stranka">Sortiraj: Stranka (A–Ž)</option>
          </select>

          <span className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200/70 dark:border-slate-700">
            {filteredItems.length}
          </span>
        </div>
      </div>

      {/* Traka skupnih akcija kad su označeni predmeti */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shadow-md border border-slate-700">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>Označeno predmeta: {selectedIds.size}</span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-300 hover:text-white underline ml-2 cursor-pointer"
            >
              Poništi odabir
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeletingIds(Array.from(selectedIds))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Trajno obriši označene ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* 3. GLAVNA TABLICA PREDMETA */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200/90 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <th className="pl-4 pr-2 py-3.5 w-9">
                  <input
                    type="checkbox"
                    checked={
                      filteredItems.length > 0 &&
                      filteredItems.every((p) => selectedIds.has(p.id))
                    }
                    onChange={toggleSelectAllFiltered}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3.5">KLASA / Područje</th>
                <th className="px-4 py-3.5">Stranka / Žalitelj</th>
                <th className="px-4 py-3.5">Obrađivač & Parafi</th>
                <th className="px-4 py-3.5">Spis</th>
                {type === 'aktivni' ? (
                  <>
                    <th className="px-4 py-3.5">Zaprimanje & ZUP rok</th>
                    <th className="px-4 py-3.5">Faza rada</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3.5">Ishod rješavanja</th>
                    <th className="px-4 py-3.5">Arhivirano</th>
                  </>
                )}
                <th className="px-4 py-3.5 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
                        {type === 'aktivni' ? (
                          <Inbox className="w-6 h-6" />
                        ) : (
                          <Archive className="w-6 h-6" />
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base mb-1">
                        {search.trim() ||
                        filterPodrucje !== 'sve' ||
                        filterSecondary !== 'sve' ||
                        filterSluzbenik !== 'sve' ||
                        onlyUrgent
                          ? 'Nema predmeta za odabrani filtar'
                          : type === 'aktivni'
                          ? 'Nema aktivnih predmeta'
                          : 'Arhiva je prazna'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {type === 'aktivni'
                          ? 'Dodajte novi predmet klikom na gumb "Novi predmet" u gornjem desnom kutu.'
                          : 'Riješeni predmeti koje spremite u A/A pojavit će se ovdje.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((predmet) => {
                  const isRowLoading = loadingId === predmet.id;
                  const deadline =
                    type === 'aktivni' ? calculateZupDeadline(predmet.datum_predaje_zalbe) : null;
                  const fazaObj =
                    PREDMET_FAZE.find((f) => f.value === predmet.faza) || PREDMET_FAZE[0];
                  const ishodObj = PREDMET_ISHODI.find((i) => i.value === predmet.ishod);
                  const latestParaf =
                    Array.isArray(predmet.parafi) && predmet.parafi.length > 0
                      ? predmet.parafi[0]
                      : null;
                  const latestParafStatus = latestParaf
                    ? PARAF_STATUSI.find((s) => s.value === latestParaf.status) || PARAF_STATUSI[0]
                    : null;

                  return (
                    <tr
                      key={predmet.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        selectedIds.has(predmet.id) ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="pl-4 pr-2 py-3.5 align-top pt-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(predmet.id)}
                          onChange={() => toggleSelectOne(predmet.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* KLASA, URBROJ, Područje i Napomena */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/predmeti/${predmet.id}`}
                            className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {predmet.klasa}
                          </Link>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {predmet.podrucje}
                          </span>
                        </div>
                        {predmet.urbroj && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Urbroj: {predmet.urbroj}
                          </p>
                        )}
                        {predmet.napomena && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-1 line-clamp-1 max-w-xs">
                            „{predmet.napomena}”
                          </p>
                        )}
                        {predmet.nadlezni_postupak_status === 'vraceno' && (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-semibold">
                            <RotateCcw className="w-2.5 h-2.5" />
                            Vraćeno s I. stupnja
                            {predmet.nadlezni_postupak_datum_slanja
                              ? ` (poslano ${formatIsoDateHr(predmet.nadlezni_postupak_datum_slanja)})`
                              : ''}
                          </span>
                        )}
                      </td>

                      {/* Stranka */}
                      <td className="px-4 py-3.5 align-top">
                        <Link
                          href={`/predmeti/${predmet.id}`}
                          className="font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 block max-w-52 truncate"
                        >
                          {predmet.stranka || '-'}
                        </Link>
                      </td>

                      {/* Obrađivač (Delegirani službenik) & Parafiranje */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          {/* Zaduženi službenik */}
                          {predmet.sluzbenik_ime ? (
                            <button
                              type="button"
                              onClick={() => {
                                setParafModalItem(predmet);
                                setParafModalTab('delegiranje');
                              }}
                              title={
                                predmet.uputa_voditelja
                                  ? `Uputa: ${predmet.uputa_voditelja}`
                                  : 'Kliknite za izmjenu zaduženog službenika ili upute'
                              }
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {getInitials(predmet.sluzbenik_ime)}
                              </span>
                              <span className="truncate max-w-36">{predmet.sluzbenik_ime}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setParafModalItem(predmet);
                                setParafModalTab('delegiranje');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                              title="Delegiraj predmet službeniku u rad"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Delegiraj u rad</span>
                            </button>
                          )}

                          {/* Zadnji paraf ili gumb za parafiranje */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {latestParaf && latestParafStatus ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setParafModalItem(predmet);
                                  setParafModalTab('paraf');
                                }}
                                title={`${latestParaf.status}: ${latestParaf.vrsta_akta} (${new Date(
                                  latestParaf.datum
                                ).toLocaleDateString('hr-HR')})${
                                  latestParaf.napomena ? ` — ${latestParaf.napomena}` : ''
                                }`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:opacity-85 transition-opacity ${latestParafStatus.badgeClass}`}
                              >
                                <Stamp className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate max-w-44">
                                  {latestParaf.status === 'Parafirano'
                                    ? 'Paraf:'
                                    : latestParaf.status === 'Parafirano uz izmjene'
                                    ? 'Paraf (izmj.):'
                                    : 'Dorada:'}{' '}
                                  {latestParaf.vrsta_akta}
                                </span>
                                {predmet.parafi.length > 1 && (
                                  <span className="ml-0.5 opacity-80">
                                    (+{predmet.parafi.length - 1})
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setParafModalItem(predmet);
                                  setParafModalTab('paraf');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50/70 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-[10px] font-bold transition-colors cursor-pointer"
                                title="Evidentiraj paraf dopisa ili rješenja u ovom predmetu"
                              >
                                <Stamp className="w-2.5 h-2.5" />
                                <span>+ Evidentiraj paraf</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Dokumenti u spisu */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        {predmet.broj_dokumenata > 0 ? (
                          <Link
                            href={`/predmeti/${predmet.id}`}
                            title={`Učitano: ${predmet.vrste_dokumenata.join(', ')}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/70 hover:bg-blue-100/80 text-blue-800 border border-blue-200/80 text-xs font-semibold transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            {predmet.broj_dokumenata} dok.
                          </Link>
                        ) : (
                          <Link
                            href={`/predmeti/${predmet.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold"
                          >
                            Prazan spis
                          </Link>
                        )}
                      </td>

                      {type === 'aktivni' ? (
                        <>
                          {/* Primitak u Ministarstvu, predaja žalbe & ZUP rok 60 dana */}
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                              <span className="text-[10px] text-slate-400 mr-1">Min.:</span>
                              {predmet.datum_zaprimanja
                                ? new Date(predmet.datum_zaprimanja).toLocaleDateString('hr-HR')
                                : '-'}
                            </p>
                            {predmet.datum_predaje_zalbe ? (
                              <>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  <span className="text-[10px] text-slate-400 mr-1">Žalba:</span>
                                  {/^\d{4}-\d{2}-\d{2}$/.test(predmet.datum_predaje_zalbe)
                                    ? `${predmet.datum_predaje_zalbe.split('-').reverse().join('.')}.`
                                    : new Date(predmet.datum_predaje_zalbe).toLocaleDateString('hr-HR')}
                                </p>
                                {deadline && (
                                  <span
                                    title={`Zakonski rok (60 dana od predaje žalbe, čl. 121. ZUP-a) istječe: ${deadline.deadlineDateFormatted}`}
                                    className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                      deadline.urgency === 'overdue'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : deadline.urgency === 'warning'
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3" />
                                    {deadline.label}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span
                                title="Zakonski rok od 60 dana počinje teći od predaje žalbe (ne od zaprimanja u Ministarstvu)"
                                className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                              >
                                <Clock className="w-3 h-3 text-slate-400" />
                                Čeka datum žalbe
                              </span>
                            )}
                          </td>

                          {/* Radna faza (brzi odabir) */}
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <select
                              value={predmet.faza}
                              onChange={(e) =>
                                handleFazaChange(predmet.id, e.target.value as PredmetFaza)
                              }
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${fazaObj.badgeClass}`}
                            >
                              {PREDMET_FAZE.map((f) => (
                                <option key={f.value} value={f.value} className="bg-white text-slate-800">
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Ishod rješavanja u Arhivi */}
                          <td className="px-4 py-3.5 align-top">
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                  ishodObj
                                    ? ishodObj.badgeClass
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {predmet.ishod || 'Arhivirano (A/A)'}
                              </span>
                              {predmet.poslano_u_praksu && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                                  <Landmark className="w-2.5 h-2.5" />
                                  U Bazi prakse
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Datum A/A */}
                          <td className="px-4 py-3.5 align-top whitespace-nowrap text-xs text-slate-600">
                            {predmet.datum_rjesavanja
                              ? new Date(predmet.datum_rjesavanja).toLocaleDateString('hr-HR')
                              : predmet.datum_zaprimanja
                              ? new Date(predmet.datum_zaprimanja).toLocaleDateString('hr-HR')
                              : '-'}
                          </td>
                        </>
                      )}

                      {/* Akcije */}
                      <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Link
                            href={`/predmeti/${predmet.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-lg transition-colors"
                            title="Otvori spis i AI analizu"
                          >
                            <span>Spis</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => {
                              setParafModalItem(predmet);
                              setParafModalTab('paraf');
                            }}
                            className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 rounded-lg transition-colors cursor-pointer"
                            title="Parafiranje dopisa/rješenja i delegiranje službeniku"
                          >
                            <Stamp className="w-3.5 h-3.5" />
                          </button>

                          {type === 'aktivni' && (
                            <button
                              type="button"
                              onClick={() => setNadlezniModalItem(predmet)}
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded-lg transition-colors cursor-pointer"
                              title="Žalba poslana izravno Ministarstvu — prebaci u Na nadležnom postupku"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setEditingItem({ ...predmet })}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Uredi podatke predmeta"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {type === 'aktivni' ? (
                            <button
                              type="button"
                              onClick={() => openArchiveModal(predmet)}
                              disabled={isRowLoading}
                              title="Riješi i spremi u arhivu (A/A)"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5 text-amber-600" />
                              <span>A/A</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUnarchive(predmet)}
                              disabled={isRowLoading}
                              title="Vrati predmet u aktivne"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                            >
                              {isRowLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                              <span>Aktiviraj</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setDeletingIds([predmet.id])}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors"
                            title="Trajno obriši predmet i njegove skenove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: UREĐIVANJE PREDMETA */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !modalLoading && setEditingItem(null)}
        >
          <form
            onSubmit={handleConfirmEdit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Uredi podatke predmeta</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">KLASA *</label>
                  <input
                    type="text"
                    required
                    value={editingItem.klasa}
                    onChange={(e) => setEditingItem({ ...editingItem, klasa: e.target.value })}
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
                    value={editingItem.urbroj}
                    onChange={(e) => setEditingItem({ ...editingItem, urbroj: e.target.value })}
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
                  value={editingItem.stranka}
                  onChange={(e) => setEditingItem({ ...editingItem, stranka: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Područje
                  </label>
                  <select
                    value={editingItem.podrucje}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        podrucje: e.target.value as PredmetPodrucje,
                      })
                    }
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
                    Datum primitka (Ministarstvo)
                  </label>
                  <input
                    type="date"
                    value={editingItem.datum_zaprimanja}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, datum_zaprimanja: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Datum predaje žalbe (početak roka 60 dana)
                </label>
                <input
                  type="date"
                  value={editingItem.datum_predaje_zalbe || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      datum_predaje_zalbe: e.target.value,
                      datum_predaje_zalbe_izvor: e.target.value ? 'ručno' : '',
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Ostavite prazno dok datum predaje žalbe nije poznat (čl. 121. ZUP-a).
                </p>
              </div>

              {type === 'arhiva' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Ishod rješavanja
                  </label>
                  <select
                    value={editingItem.ishod || 'Odbijena žalba'}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        ishod: e.target.value as PredmetIshod,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {PREDMET_ISHODI.map((ish) => (
                      <option key={ish.value} value={ish.value}>
                        {ish.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Zaduženi službenik (Obrađivač)
                </label>
                <select
                  value={editingItem.sluzbenik_id || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const found = sluzbenici.find((s) => s.id === val);
                    setEditingItem({
                      ...editingItem,
                      sluzbenik_id: val,
                      sluzbenik_ime: found ? found.imePrezime : '',
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
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
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Interna bilješka
                </label>
                <input
                  type="text"
                  value={editingItem.napomena || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, napomena: e.target.value })}
                  placeholder="Kratka napomena o predmetu..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={modalLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                {modalLoading ? 'Spremam...' : 'Spremi izmjene'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: ARHIVIRANJE (A/A) S ISHODOM */}
      {archivingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !modalLoading && setArchivingItem(null)}
        >
          <form
            onSubmit={handleConfirmArchive}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Arhiviraj predmet (A/A)</h3>
              </div>
              <button
                type="button"
                onClick={() => setArchivingItem(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                <p className="font-bold text-slate-900">{archivingItem.klasa}</p>
                <p className="text-slate-600">Stranka: {archivingItem.stranka}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Kako je predmet riješen (ishod)?
                </label>
                <select
                  value={archiveIshod}
                  onChange={(e) => setArchiveIshod(e.target.value as PredmetIshod)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {PREDMET_ISHODI.map((ish) => (
                    <option key={ish.value} value={ish.value}>
                      {ish.label}
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
                  value={archiveNapomena}
                  onChange={(e) => setArchiveNapomena(e.target.value)}
                  placeholder="npr. Rješenje otpremljeno stranci 27.10.2026."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setArchivingItem(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={modalLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                {modalLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                Spremi u Arhivu (A/A)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: POTVRDA TRAJNOG BRISANJA PREDMETA I DATOTEKA */}
      {deletingIds && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !modalLoading && setDeletingIds(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-200 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Trajno brisanje predmeta</h3>
            </div>

            <div className="p-6 space-y-3 text-sm text-slate-700">
              {deletingItemsSummary.count === 1 ? (
                <p>
                  Jeste li sigurni da želite trajno obrisati predmet{' '}
                  <strong className="text-slate-900">{deletingItemsSummary.sampleKlasa}</strong> (
                  {deletingItemsSummary.sampleStranka})?
                </p>
              ) : (
                <p>
                  Jeste li sigurni da želite trajno obrisati{' '}
                  <strong className="text-slate-900">
                    {deletingItemsSummary.count} označena predmeta
                  </strong>
                  ?
                </p>
              )}

              <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-800">
                Ovom radnjom trajno se brišu zapis o predmetu i{' '}
                <strong>{deletingItemsSummary.totalDocs} priloženih dokumenata/skenova</strong> iz
                baze i iz pohrane (`spisi`). Radnja se ne može poništiti.
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={modalLoading}
                onClick={() => setDeletingIds(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Odustani
              </button>
              <button
                type="button"
                disabled={modalLoading}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {modalLoading ? (
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

      {/* MODAL 4: PARAFIRANJE DOPISA/RJEŠENJA I DELEGIRANJE PREDMETA */}
      <ParafiranjeModal
        predmet={parafModalItem}
        isOpen={Boolean(parafModalItem)}
        initialTab={parafModalTab}
        sluzbeniciList={sluzbenici}
        onClose={() => setParafModalItem(null)}
        onManageSluzbenici={() => setSluzbeniciModalOpen(true)}
        onUpdated={(patch) => {
          if (!parafModalItem) return;
          const targetId = parafModalItem.id;
          setItems((prev) =>
            prev.map((p) => (p.id === targetId ? { ...p, ...patch } : p))
          );
          setParafModalItem((prev) => (prev ? { ...prev, ...patch } : null));
          startTransition(() => router.refresh());
        }}
      />

      {/* MODAL 5: UPRAVLJANJE POPISOM SLUŽBENIKA */}
      <SluzbeniciModal
        isOpen={sluzbeniciModalOpen}
        onClose={() => setSluzbeniciModalOpen(false)}
        predmeti={items}
        onUpdated={(updated) => setSluzbenici(updated)}
      />

      {/* MODAL 6: SLANJE ŽALBE NA NADLEŽNI POSTUPAK I. STUPNJU */}
      <NadlezniPostupakModal
        predmet={nadlezniModalItem}
        isOpen={Boolean(nadlezniModalItem)}
        onClose={() => setNadlezniModalItem(null)}
        onUpdated={(updated) => {
          setItems((prev) =>
            prev.map((p) =>
              p.id === updated.id
                ? {
                    ...p,
                    nadlezni_postupak_status: updated.status,
                    nadlezni_postupak_tijelo: updated.tijelo,
                    nadlezni_postupak_datum_slanja: updated.datum_slanja,
                    nadlezni_postupak_datum_povratka: updated.datum_povratka,
                    nadlezni_postupak_napomena: updated.napomena,
                  }
                : p
            )
          );
          if (updated.status === 'potrebno_poslati' || updated.status === 'poslano') {
            setFeedback({
              type: 'success',
              message:
                updated.status === 'potrebno_poslati'
                  ? 'Predmet je premješten u karticu „Na nadležnom postupku” (čeka slanje I. stupnju).'
                  : 'Slanje I. stupnju je evidentirano — predmet je u kartici „Na nadležnom postupku”.',
            });
          }
          startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}
