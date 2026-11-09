'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  X,
  ExternalLink,
  ChevronDown,
  Building2,
  User,
  ShieldAlert,
  Inbox,
  FolderOpen,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { getUpravniSporoviAction, type SporoviStats } from '@/app/actions/sporoviActions';
import type { UpravniSpor } from '@/lib/upravni-sporovi';

interface UpravniSporoviModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpravniSporoviModal({ isOpen, onClose }: UpravniSporoviModalProps) {
  const [sporovi, setSporovi] = useState<UpravniSpor[]>([]);
  const [stats, setStats] = useState<SporoviStats | null>(null);
  const [lastModified, setLastModified] = useState<string>('');
  const [source, setSource] = useState<'live' | 'cache'>('cache');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'pregled' | 'radar' | 'uvoz'>('pregled');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sudFilter, setSudFilter] = useState('sve');
  const [statusFilter, setStatusFilter] = useState<'sve' | 'u_radu' | 'hitno' | 'sutnja' | 'rijeseno'>('u_radu');
  const [rjesavateljFilter, setRjesavateljFilter] = useState('sve');
  const [selectedSpor, setSelectedSpor] = useState<UpravniSpor | null>(null);

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const res = await getUpravniSporoviAction(forceRefresh);
      if (res.success) {
        setSporovi(res.sporovi);
        setStats(res.stats);
        setLastModified(res.lastModified);
        setSource(res.source);
      }
    } catch (err) {
      console.error('Greška pri dohvaćanju sporova:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData(false);
    }
  }, [isOpen]);

  // Unique list of courts and rješavatelji for filter dropdowns
  const sudoviList = useMemo(() => {
    const set = new Set<string>();
    sporovi.forEach((s) => {
      if (s.sud) set.add(s.sud);
    });
    return Array.from(set).sort();
  }, [sporovi]);

  const rjesavateljiList = useMemo(() => {
    const set = new Set<string>();
    sporovi.forEach((s) => {
      if (s.rjesavatelj) set.add(s.rjesavatelj);
    });
    return Array.from(set).sort();
  }, [sporovi]);

  // Filtered sporovi
  const filteredSporovi = useMemo(() => {
    return sporovi.filter((s) => {
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText =
          s.tuzitelj.toLowerCase().includes(q) ||
          s.poslovniBroj.toLowerCase().includes(q) ||
          (s.oib && s.oib.includes(q)) ||
          s.upIiRjesenje.toLowerCase().includes(q) ||
          s.rjesavatelj.toLowerCase().includes(q) ||
          s.predmet.toLowerCase().includes(q) ||
          s.sud.toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      // Sud filter
      if (sudFilter !== 'sve' && s.sud !== sudFilter) return false;

      // Rješavatelj filter
      if (rjesavateljFilter !== 'sve' && s.rjesavatelj !== rjesavateljFilter) return false;

      // Status filter
      if (statusFilter === 'u_radu') {
        if (s.isPresudeno) return false;
      } else if (statusFilter === 'hitno') {
        if (!['isteklo', 'danas', 'kriticno', 'hitno'].includes(s.hitnost)) return false;
      } else if (statusFilter === 'sutnja') {
        if (!s.isSutnjaUprave) return false;
      } else if (statusFilter === 'rijeseno') {
        if (!s.isPresudeno) return false;
      }

      return true;
    });
  }, [sporovi, searchQuery, sudFilter, statusFilter, rjesavateljFilter]);

  // Radar hitni sporovi (sorted by deadline urgency)
  const radarSporovi = useMemo(() => {
    return sporovi
      .filter((s) => ['isteklo', 'danas', 'kriticno', 'hitno', 'u_roku'].includes(s.hitnost) && !s.isPresudeno)
      .sort((a, b) => (a.danaDoRoka ?? 999) - (b.danaDoRoka ?? 999));
  }, [sporovi]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Upravni sporovi pred upravnim sudovima (ZUS)
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  e-Komunikacija & Tablica
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sinkronizirano s Excel evidencijom i OneDrive mapama • {stats?.total || 0} evidentiranih sporova
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              title="Ponovno pročitaj iz Excel datoteke"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{loading ? 'Čitanje...' : 'Osvježi iz Excela'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STATS STRIP / KPI BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-slate-50/40 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-800/80 text-xs">
          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('u_radu');
            }}
            className="cursor-pointer p-2.5 rounded-xl border border-blue-200/70 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
          >
            <div>
              <p className="text-blue-600 dark:text-blue-400 font-medium">U radu / Čeka odluku</p>
              <p className="text-lg font-bold text-blue-950 dark:text-blue-100">{stats?.uTijeku ?? 0}</p>
            </div>
            <Clock className="w-5 h-5 text-blue-500/70" />
          </div>

          <div
            onClick={() => {
              setActiveTab('radar');
            }}
            className={`cursor-pointer p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
              (stats?.hitni ?? 0) > 0
                ? 'border-rose-300 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100/70'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800'
            }`}
          >
            <div>
              <p className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                Radar rokova (Hitno)
              </p>
              <p className="text-lg font-bold text-rose-950 dark:text-rose-100">{stats?.hitni ?? 0}</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>

          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('sutnja');
            }}
            className="cursor-pointer p-2.5 rounded-xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30 flex items-center justify-between hover:bg-amber-50 transition-colors"
          >
            <div>
              <p className="text-amber-700 dark:text-amber-400 font-medium">Šutnja uprave (čl. 24. ZUS)</p>
              <p className="text-lg font-bold text-amber-950 dark:text-amber-100">{stats?.sutnjaUprave ?? 0}</p>
            </div>
            <ShieldAlert className="w-5 h-5 text-amber-500/70" />
          </div>

          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('rijeseno');
            }}
            className="cursor-pointer p-2.5 rounded-xl border border-emerald-200/70 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 flex items-center justify-between hover:bg-emerald-50 transition-colors"
          >
            <div>
              <p className="text-emerald-700 dark:text-emerald-400 font-medium">Presuđeno / Dovršeno</p>
              <p className="text-lg font-bold text-emerald-950 dark:text-emerald-100">{stats?.presudeni ?? 0}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500/70" />
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('pregled')}
            className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'pregled'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Svi sporovi ({sporovi.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('radar')}
            className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'radar'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Radar rokova</span>
            {radarSporovi.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {radarSporovi.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('uvoz')}
            className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'uvoz'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Uvoz iz e-Komunikacije</span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: PREGLED SVIH SPOROVA */}
          {activeTab === 'pregled' && (
            <div className="space-y-4">
              {/* FILTRI I PRETRAGA */}
              <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pretraži po tužitelju, OIB-u, posl. broju (npr. Us I-2546/2026), klasi..."
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Status filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <option value="sve">Svi statusi</option>
                    <option value="u_radu">U radu / Čeka rješenje</option>
                    <option value="hitno">Hitni rokovi (Radar)</option>
                    <option value="sutnja">Šutnja uprave</option>
                    <option value="rijeseno">Presuđeno / Završeno</option>
                  </select>

                  {/* Sud filter */}
                  <select
                    value={sudFilter}
                    onChange={(e) => setSudFilter(e.target.value)}
                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <option value="sve">Svi upravni sudovi</option>
                    {sudoviList.map((sud) => (
                      <option key={sud} value={sud}>
                        {sud}
                      </option>
                    ))}
                  </select>

                  {/* Rješavatelj filter */}
                  <select
                    value={rjesavateljFilter}
                    onChange={(e) => setRjesavateljFilter(e.target.value)}
                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <option value="sve">Svi rješavatelji</option>
                    {rjesavateljiList.map((rj) => (
                      <option key={rj} value={rj}>
                        {rj}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* TABLICA SPOROVA */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3">Poslovni broj & Sud</th>
                        <th className="py-2.5 px-3">Tužitelj</th>
                        <th className="py-2.5 px-3">Predmet / Pobijani akt</th>
                        <th className="py-2.5 px-3">Rješavatelj</th>
                        <th className="py-2.5 px-3">Rok / Status odgovora</th>
                        <th className="py-2.5 px-3">Presuda & Ishod</th>
                        <th className="py-2.5 px-3 text-right">Pregled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredSporovi.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            Nema sporova koji odgovaraju odabranim kriterijima.
                          </td>
                        </tr>
                      ) : (
                        filteredSporovi.map((spor) => {
                          const isSelected = selectedSpor?.id === spor.id;
                          return (
                            <tr
                              key={spor.id}
                              onClick={() => setSelectedSpor(isSelected ? null : spor)}
                              className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                                isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/40' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-2xs">
                                {spor.rbr}
                              </td>

                              {/* Poslovni broj & Sud */}
                              <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                    {spor.poslovniBroj || 'Bez broja'}
                                  </span>
                                  <span className="text-2xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                                    {spor.sud}
                                  </span>
                                </div>
                              </td>

                              {/* Tužitelj */}
                              <td className="py-2.5 px-3">
                                <div className="font-medium text-slate-900 dark:text-slate-200">
                                  {spor.tuzitelj}
                                </div>
                                {spor.oib && (
                                  <div className="text-2xs text-slate-400 font-mono">OIB: {spor.oib}</div>
                                )}
                              </td>

                              {/* Predmet / Pobijani akt */}
                              <td className="py-2.5 px-3 max-w-[200px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {spor.isSutnjaUprave && (
                                    <span className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                      Šutnja uprave
                                    </span>
                                  )}
                                  {spor.predmet && (
                                    <span className="px-1.5 py-0.5 rounded text-2xs bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                      {spor.predmet}
                                    </span>
                                  )}
                                </div>
                                {spor.upIiRjesenje && !spor.isSutnjaUprave && (
                                  <p className="text-2xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    {spor.upIiRjesenje}
                                  </p>
                                )}
                              </td>

                              {/* Rješavatelj */}
                              <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                <span className="inline-flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  {spor.rjesavatelj || 'Nije dodijeljeno'}
                                </span>
                              </td>

                              {/* Rok / Status odgovora */}
                              <td className="py-2.5 px-3">
                                {spor.hitnost === 'isteklo' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                    <AlertTriangle className="w-3 h-3" />
                                    Isteklo ({Math.abs(spor.danaDoRoka!)} d)
                                  </span>
                                )}
                                {spor.hitnost === 'danas' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-600 text-white animate-pulse">
                                    Danas istječe rok!
                                  </span>
                                )}
                                {spor.hitnost === 'kriticno' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                    <Clock className="w-3 h-3 text-rose-600" />
                                    Još {spor.danaDoRoka} dana!
                                  </span>
                                )}
                                {spor.hitnost === 'hitno' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    <Clock className="w-3 h-3" />
                                    Još {spor.danaDoRoka} d
                                  </span>
                                )}
                                {spor.isOdgovoreno && (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Odgovoreno
                                  </span>
                                )}
                                <p className="text-2xs text-slate-500 dark:text-slate-400 truncate max-w-[180px] mt-0.5">
                                  {spor.odgovorNaTuzbu || 'Nema zabilješke'}
                                </p>
                              </td>

                              {/* Presuda */}
                              <td className="py-2.5 px-3 max-w-[180px]">
                                {spor.presudaTroskovi ? (
                                  <div>
                                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                      {spor.presudaTroskovi}
                                    </p>
                                    {spor.datumZapPresude && (
                                      <p className="text-2xs text-slate-400">Zaprimljeno: {spor.datumZapPresude}</p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-2xs">U tijeku</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <button className="px-2 py-1 rounded text-2xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60">
                                  {isSelected ? 'Sakrij' : 'Detalji'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* DETALJI ODABRANOG SPORA (SIDE/BOTTOM CARD) */}
                {selectedSpor && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {selectedSpor.poslovniBroj} — {selectedSpor.tuzitelj}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                          {selectedSpor.sud}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedSpor(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Zatvori detalje ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                        <p className="text-slate-400 font-semibold mb-1">Tužba i rokovi</p>
                        <p><strong>Preuzeto s e-Komunikacije:</strong> {selectedSpor.tuzbaPreuzeta || '-'}</p>
                        <p><strong>Evidencija odgovora:</strong> {selectedSpor.odgovorNaTuzbu || '-'}</p>
                        {selectedSpor.rokDatum && (
                          <p className="mt-1 text-rose-600 font-bold">
                            Određeni rok suda: {selectedSpor.rokDatum}
                          </p>
                        )}
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                        <p className="text-slate-400 font-semibold mb-1">Presuda i postupanje</p>
                        <p><strong>Odluka suda:</strong> {selectedSpor.presudaTroskovi || 'Još nema presude'}</p>
                        <p><strong>Akt UP/II po presudi:</strong> {selectedSpor.aktUpIiPoPresudi || '-'}</p>
                        <p><strong>Žalba / VUSRH:</strong> {selectedSpor.visokiUpravniSud || selectedSpor.zalbaPresuda || '-'}</p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                        <p className="text-slate-400 font-semibold mb-1">Predmet & Rješavatelj</p>
                        <p><strong>Rješavatelj:</strong> {selectedSpor.rjesavatelj || '-'}</p>
                        <p><strong>Pobijani akt:</strong> {selectedSpor.upIiRjesenje || '-'}</p>
                        <p><strong>Napomena:</strong> {selectedSpor.vrijednostNapomena || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: RADAR ROKOVA */}
          {activeTab === 'radar' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                <div className="text-xs text-rose-900 dark:text-rose-200">
                  <p className="font-bold text-sm">Radar zakonskih i sudskih rokova (ZUS)</p>
                  <p className="mt-0.5">
                    Ovdje su automatski izdvojeni svi sporovi koji čekaju poduzimanje radnje (odgovor na tužbu, dostavu spisa ili izradu drugostupanjskog rješenja nakon presude kod šutnje uprave).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {radarSporovi.length === 0 ? (
                  <div className="col-span-2 py-12 text-center text-slate-400">
                    Nema hitnih rokova u ovom trenutku! Svi odgovori su evidentirani ili su rokovi komotni.
                  </div>
                ) : (
                  radarSporovi.map((spor) => (
                    <div
                      key={spor.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {spor.poslovniBroj}
                            </span>
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {spor.sud}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                            {spor.tuzitelj}
                          </p>
                        </div>

                        {spor.hitnost === 'isteklo' && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Isteklo prije {Math.abs(spor.danaDoRoka!)} d
                          </span>
                        )}
                        {spor.hitnost === 'danas' && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-600 text-white animate-pulse">
                            Danas!
                          </span>
                        )}
                        {spor.hitnost === 'kriticno' && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Još {spor.danaDoRoka} dana!
                          </span>
                        )}
                        {spor.hitnost === 'hitno' && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Još {spor.danaDoRoka} dana
                          </span>
                        )}
                        {spor.hitnost === 'u_roku' && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Još {spor.danaDoRoka} dana
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg">
                        <p><strong>Evidencija:</strong> {spor.odgovorNaTuzbu || spor.aktUpIiPoPresudi || '-'}</p>
                        <p><strong>Rješavatelj:</strong> {spor.rjesavatelj || '-'}</p>
                        {spor.upIiRjesenje && <p><strong>Spis:</strong> {spor.upIiRjesenje}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: UVOZ IZ E-KOMUNIKACIJE (DROPZONE PREP ZA KORAK 2) */}
          {activeTab === 'uvoz' && (
            <div className="space-y-4">
              <div className="p-6 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                  <Inbox className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Drag & Drop paket dokumenata s e-Komunikacije
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg mx-auto">
                    Kada preuzmete tužbu s e-Komunikacije u svoju mapu, samo povucite PDF-ove ovdje (Tužba, Dopis suda s rokom, Potvrda primitka).
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md mx-auto text-left text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-indigo-500" />
                    Vaša lokalna mapa na OneDrive-u:
                  </p>
                  <p className="font-mono text-2xs bg-slate-100 dark:bg-slate-800 p-1.5 rounded truncate">
                    C:\Users\dmalbasa\OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije\P O S A O\UPRAVNI SPOROVI\e_komunikacija sa sudovima
                  </p>
                </div>

                <div className="pt-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-xs opacity-90 cursor-default">
                    ✨ Pripremljeno za automatsku AI analizu i izradu Word odgovora (Korak 2)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Izvor podataka:{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {source === 'live' ? 'Excel tablica (u stvarnom vremenu)' : 'Lokalna predmemorija (Cache)'}
            </span>
            {lastModified && (
              <span className="ml-2">
                (Ažurirano: {new Date(lastModified).toLocaleDateString('hr-HR')}{' '}
                {new Date(lastModified).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Zatvori
          </button>
        </div>
      </div>
    </div>
  );
}
