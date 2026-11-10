'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Scale,
  Inbox,
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  X,
  ExternalLink,
  Building2,
  User,
  ShieldAlert,
  FolderOpen,
  Sparkles,
  Upload,
  Calendar,
  Check,
  Loader2,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';
import type { UpravniSpor } from '@/lib/upravni-sporovi';
import type { EnrichedPredmet } from '@/lib/predmet-meta';
import type { ExtractedCourtCase } from '@/lib/court-packet-parser';
import PredmetiTable from '@/components/PredmetiTable';
import NewPredmetButton from '@/components/NewPredmetButton';
import {
  getUpravniSporoviAction,
  analyzeCourtPacketAction,
  listOneDriveFoldersAction,
  analyzeFromOneDriveFolderAction,
  saveNewSporAction,
} from '@/app/actions/sporoviActions';

interface MainDashboardViewProps {
  initialSporovi: UpravniSpor[];
  initialPredmeti: EnrichedPredmet[];
  lastModified: string;
  source: 'live' | 'cache';
}

export default function MainDashboardView({
  initialSporovi,
  initialPredmeti,
  lastModified: initLastModified,
  source: initSource,
}: MainDashboardViewProps) {
  // Top-level View Mode: 'zup' (default) or 'sporovi'
  const [mainView, setMainView] = useState<'sporovi' | 'zup'>('zup');

  // Sporovi state
  const [sporovi, setSporovi] = useState<UpravniSpor[]>(initialSporovi);
  const [lastModified, setLastModified] = useState(initLastModified);
  const [source, setSource] = useState(initSource);
  const [loading, setLoading] = useState(false);
  const [sporoviSubTab, setSporoviSubTab] = useState<'tablica' | 'radar' | 'uvoz'>('tablica');

  // Filters for Sporovi - default to 'u_radu' (samo predmeti bez presude)
  const [searchQuery, setSearchQuery] = useState('');
  const [sudFilter, setSudFilter] = useState('sve');
  const [statusFilter, setStatusFilter] = useState<'sve' | 'u_radu' | 'hitno' | 'sutnja' | 'troskovi' | 'rijeseno'>('u_radu');
  const [rjesavateljFilter, setRjesavateljFilter] = useState('sve');
  const [selectedSpor, setSelectedSpor] = useState<UpravniSpor | null>(null);

  // Uvoz iz e-Komunikacije state
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedCourtCase | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OneDrive folders
  const [oneDriveFolders, setOneDriveFolders] = useState<{ name: string; mtime: string }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Editable Form states
  const [formSud, setFormSud] = useState('');
  const [formPoslovniBroj, setFormPoslovniBroj] = useState('');
  const [formTuzitelj, setFormTuzitelj] = useState('');
  const [formOib, setFormOib] = useState('');
  const [formVrstaSpora, setFormVrstaSpora] = useState('Šutnja uprave');
  const [formPredmet, setFormPredmet] = useState('nuv');
  const [formPobijaniAkt, setFormPobijaniAkt] = useState('');
  const [formDatumPreuzimanja, setFormDatumPreuzimanja] = useState('');
  const [formRokDana, setFormRokDana] = useState(30);
  const [formRokDospijeca, setFormRokDospijeca] = useState('');
  const [formRjesavatelj, setFormRjesavatelj] = useState('Dino Malbaša');
  const [formSazetak, setFormSazetak] = useState('');

  // Reload disputes from Excel
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await getUpravniSporoviAction(true);
      if (res.success) {
        setSporovi(res.sporovi);
        setLastModified(res.lastModified);
        setSource(res.source);
      }
    } catch (err) {
      console.error('Error refreshing sporovi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    listOneDriveFoldersAction().then((res) => {
      if (res.success) setOneDriveFolders(res.folders);
    });
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    let uTijeku = 0;
    let hitni = 0;
    let sutnjaUprave = 0;
    let presudeni = 0;
    let troskoviZaPlacanje = 0;
    let hitniTroskovi = 0;

    sporovi.forEach((s) => {
      if (s.isPresudeno) presudeni++;
      else uTijeku++;

      if (s.isSutnjaUprave) sutnjaUprave++;

      if (['isteklo', 'danas', 'kriticno', 'hitno'].includes(s.hitnost)) {
        hitni++;
      }

      if (s.troskoviInfo?.status === 'neplaceno') {
        troskoviZaPlacanje++;
        if (['isteklo', 'danas', 'kriticno', 'hitno'].includes(s.troskoviInfo.hitnost)) {
          hitniTroskovi++;
        }
      }
    });

    return { total: sporovi.length, uTijeku, hitni, sutnjaUprave, presudeni, troskoviZaPlacanje, hitniTroskovi };
  }, [sporovi]);

  // Unique list of courts and rješavatelji
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

  // Filtered disputes
  const filteredSporovi = useMemo(() => {
    return sporovi.filter((s) => {
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

      if (sudFilter !== 'sve' && s.sud !== sudFilter) return false;
      if (rjesavateljFilter !== 'sve' && s.rjesavatelj !== rjesavateljFilter) return false;

      if (statusFilter === 'u_radu') {
        if (s.isPresudeno) return false;
      } else if (statusFilter === 'hitno') {
        if (!['isteklo', 'danas', 'kriticno', 'hitno'].includes(s.hitnost)) return false;
      } else if (statusFilter === 'sutnja') {
        if (!s.isSutnjaUprave) return false;
      } else if (statusFilter === 'troskovi') {
        if (!s.troskoviInfo?.imaTroskova || s.troskoviInfo.status === 'placeno') return false;
      } else if (statusFilter === 'rijeseno') {
        if (!s.isPresudeno) return false;
      }

      return true;
    });
  }, [sporovi, searchQuery, sudFilter, statusFilter, rjesavateljFilter]);

  // Radar disputes
  const radarSporovi = useMemo(() => {
    return sporovi
      .filter((s) => ['isteklo', 'danas', 'kriticno', 'hitno', 'u_roku'].includes(s.hitnost) && !s.isPresudeno)
      .sort((a, b) => (a.danaDoRoka ?? 999) - (b.danaDoRoka ?? 999));
  }, [sporovi]);

  const populateFormWithExtracted = (data: ExtractedCourtCase) => {
    setExtractedData(data);
    setFormSud(data.sud);
    setFormPoslovniBroj(data.poslovniBroj);
    setFormTuzitelj(data.tuzitelj);
    setFormOib(data.oib || '');
    setFormVrstaSpora(data.vrstaSpora);
    setFormPredmet(data.predmet);
    setFormPobijaniAkt(data.pobijaniAkt || '');
    setFormDatumPreuzimanja(data.datumPreuzimanja);
    setFormRokDana(data.rokDana);
    setFormRokDospijeca(data.rokDospijecaFormat);
    setFormRjesavatelj(data.rjesavateljPreporuka || 'Dino Malbaša');
    setFormSazetak(data.sazetak);
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
  };

  const handleAnalyzeFiles = async () => {
    if (queuedFiles.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisStep('Čitanje i priprema PDF paketa sa suda...');

    try {
      const fd = new FormData();
      queuedFiles.forEach((f) => fd.append('files', f));

      setAnalysisStep('Ekstrakcija podataka sa suda, potvrde primitka i rokova...');
      const res = await analyzeCourtPacketAction(fd);

      if (res.success && res.data) {
        populateFormWithExtracted(res.data);
      } else {
        setSaveErrorMsg(res.error || 'Nije uspjela analiza paketa.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveErrorMsg(msg || 'Greška pri analizi.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleAnalyzeFromFolder = async (folderName: string) => {
    setIsAnalyzing(true);
    setAnalysisStep(`Učitavanje datoteka iz mape: ${folderName}...`);

    try {
      const res = await analyzeFromOneDriveFolderAction(folderName);
      if (res.success && res.data) {
        populateFormWithExtracted(res.data);
      } else {
        setSaveErrorMsg(res.error || 'Nije uspjela analiza mape.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleSaveNewSpor = async () => {
    if (!formPoslovniBroj || !formTuzitelj) {
      setSaveErrorMsg('Poslovni broj i tužitelj su obavezna polja.');
      return;
    }

    setIsSaving(true);
    setSaveErrorMsg('');
    try {
      const dParts = formDatumPreuzimanja.split('-');
      const formattedPreuzeto =
        dParts.length === 3
          ? `${parseInt(dParts[2], 10)}.${parseInt(dParts[1], 10)}.${dParts[0]}.`
          : formDatumPreuzimanja;

      const odgovorEvidencija = `rok ${formRokDana} dana - do ${formRokDospijeca}`;

      const res = await saveNewSporAction({
        sud: formSud,
        poslovniBroj: formPoslovniBroj,
        tuzitelj: formOib ? `${formTuzitelj} (OIB:${formOib})` : formTuzitelj,
        oib: formOib,
        upIiRjesenje: formPobijaniAkt || (formVrstaSpora === 'Šutnja uprave' ? 'šutnja uprave' : ''),
        predmet: formPredmet,
        rjesavatelj: formRjesavatelj,
        tuzbaPreuzeta: formattedPreuzeto,
        odgovorNaTuzbu: odgovorEvidencija,
      });

      if (res.success) {
        setSaveSuccessMsg(`Predmet ${formPoslovniBroj} (${formTuzitelj}) uspješno je spremljen!`);
        await handleRefresh();
      } else {
        setSaveErrorMsg(res.error || 'Greška pri spremanju.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* GLAVNA NAVIGACIJSKA TRAKA: PREDMETI (ZUP) vs SPOROVI (ZUS) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 w-fit">
          <button
            onClick={() => setMainView('zup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              mainView === 'zup'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
            }`}
          >
            <Inbox className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Drugostupanjski predmeti (ZUP)</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
              {initialPredmeti.length}
            </span>
          </button>

          <button
            onClick={() => setMainView('sporovi')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              mainView === 'sporovi'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
            }`}
          >
            <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Upravni sporovi (ZUS)</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
              {sporovi.length}
            </span>
            {stats.hitni > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 animate-pulse">
                {stats.hitni} hitno
              </span>
            )}
            {stats.troskoviZaPlacanje > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                💰 {stats.troskoviZaPlacanje} troškova
              </span>
            )}
          </button>
        </div>

        {mainView === 'sporovi' ? (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSporoviSubTab('uvoz')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ Uvezi iz e-Komunikacije</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Ponovno pročitaj iz Excel datoteke"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{loading ? 'Čitanje...' : 'Osvježi iz Excela'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <NewPredmetButton />
          </div>
        )}
      </div>

      {/* VIEW 1: UPRAVNI SPOROVI (ZUS) */}
      {mainView === 'sporovi' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* KPI METRIKE */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div
              onClick={() => {
                setSporoviSubTab('tablica');
                setStatusFilter('u_radu');
              }}
              className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                statusFilter === 'u_radu' && sporoviSubTab === 'tablica'
                  ? 'border-blue-400 bg-blue-50/70 dark:bg-blue-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300'
              }`}
            >
              <p className="text-2xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                U radu / Bez presude
              </p>
              <p className="text-2xl font-bold text-blue-950 dark:text-blue-100 mt-1">{stats.uTijeku}</p>
              <p className="text-2xs text-blue-500/80 mt-0.5">aktivni postupci</p>
            </div>

            <div
              onClick={() => {
                setSporoviSubTab('radar');
              }}
              className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                sporoviSubTab === 'radar'
                  ? 'border-rose-400 bg-rose-50/80 dark:bg-rose-950/50 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-rose-300'
              }`}
            >
              <p className="text-2xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                Radar rokova
              </p>
              <p className="text-2xl font-bold text-rose-950 dark:text-rose-100 mt-1">{stats.hitni}</p>
              <p className="text-2xs text-rose-600 mt-0.5">hitne radnje</p>
            </div>

            <div
              onClick={() => {
                setSporoviSubTab('tablica');
                setStatusFilter('troskovi');
              }}
              className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                statusFilter === 'troskovi' && sporoviSubTab === 'tablica'
                  ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-2xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Troškovi spora
                </p>
                {stats.hitniTroskovi > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Hitni rokovi isplate" />
                )}
              </div>
              <p className="text-2xl font-bold text-amber-950 dark:text-amber-100 mt-1">{stats.troskoviZaPlacanje}</p>
              <p className="text-2xs text-amber-600/80 mt-0.5">
                {stats.hitniTroskovi > 0 ? `${stats.hitniTroskovi} hitan rok!` : 'paricijski rokovi'}
              </p>
            </div>

            <div
              onClick={() => {
                setSporoviSubTab('tablica');
                setStatusFilter('sutnja');
              }}
              className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                statusFilter === 'sutnja' && sporoviSubTab === 'tablica'
                  ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
              }`}
            >
              <p className="text-2xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Šutnja uprave
              </p>
              <p className="text-2xl font-bold text-amber-950 dark:text-amber-100 mt-1">{stats.sutnjaUprave}</p>
              <p className="text-2xs text-amber-600/80 mt-0.5">čl. 24. ZUS</p>
            </div>

            <div
              onClick={() => {
                setSporoviSubTab('tablica');
                setStatusFilter('rijeseno');
              }}
              className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                statusFilter === 'rijeseno' && sporoviSubTab === 'tablica'
                  ? 'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
              }`}
            >
              <p className="text-2xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Presuđeno / Dovršeno
              </p>
              <p className="text-2xl font-bold text-emerald-950 dark:text-emerald-100 mt-1">{stats.presudeni}</p>
              <p className="text-2xs text-emerald-600/80 mt-0.5">arhivirani sporovi</p>
            </div>

            <div
              onClick={() => {
                setSporoviSubTab('tablica');
                setStatusFilter('sve');
              }}
              className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                statusFilter === 'sve' && sporoviSubTab === 'tablica'
                  ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
              }`}
            >
              <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">Svi sporovi</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{stats.total}</p>
              <p className="text-2xs text-slate-400 mt-0.5">iz Excel evidencije</p>
            </div>
          </div>

          {/* SUB-TABS */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setSporoviSubTab('tablica')}
              className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                sporoviSubTab === 'tablica'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Svi sporovi ({filteredSporovi.length})</span>
            </button>

            <button
              onClick={() => setSporoviSubTab('radar')}
              className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                sporoviSubTab === 'radar'
                  ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
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
              onClick={() => setSporoviSubTab('uvoz')}
              className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                sporoviSubTab === 'uvoz'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Uvoz iz e-Komunikacije (AI Parser)</span>
            </button>
          </div>

          {/* SUB-TAB 1: TABLICA SVIH SPOROVA */}
          {sporoviSubTab === 'tablica' && (
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
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
                  >
                    <option value="u_radu">U radu / Bez presude ({stats.uTijeku})</option>
                    <option value="hitno">Hitni rokovi odgovora ({stats.hitni})</option>
                    <option value="troskovi">Troškovi za plaćanje ({stats.troskoviZaPlacanje})</option>
                    <option value="sutnja">Šutnja uprave ({stats.sutnjaUprave})</option>
                    <option value="rijeseno">Presuđeno / Završeno ({stats.presudeni})</option>
                    <option value="sve">Svi sporovi ({sporovi.length})</option>
                  </select>

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
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-3 px-3 w-12 text-center">#</th>
                        <th className="py-3 px-3">Poslovni broj & Sud</th>
                        <th className="py-3 px-3">Tužitelj</th>
                        <th className="py-3 px-3">Predmet / Pobijani akt</th>
                        <th className="py-3 px-3">Rješavatelj</th>
                        <th className="py-3 px-3">Rok / Status odgovora</th>
                        <th className="py-3 px-3">Presuda & Troškovi</th>
                        <th className="py-3 px-3 text-right">Radnja</th>
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
                            <React.Fragment key={spor.id}>
                              <tr
                                onClick={() => setSelectedSpor(isSelected ? null : spor)}
                                className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                                  isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-medium' : ''
                                }`}
                              >
                                <td className="py-3 px-3 text-center text-slate-400 font-mono text-2xs">
                                  {spor.rbr}
                                </td>

                                <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                      {spor.poslovniBroj || 'Bez broja'}
                                    </span>
                                    <span className="text-2xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                                      {spor.sud}
                                    </span>
                                  </div>
                                </td>

                                <td className="py-3 px-3">
                                  <div className="font-medium text-slate-900 dark:text-slate-200">
                                    {spor.tuzitelj}
                                  </div>
                                  {spor.oib && (
                                    <div className="text-2xs text-slate-400 font-mono">OIB: {spor.oib}</div>
                                  )}
                                </td>

                                <td className="py-3 px-3 max-w-[200px]">
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

                                <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                                  <span className="inline-flex items-center gap-1">
                                    <User className="w-3 h-3 text-slate-400" />
                                    {spor.rjesavatelj || 'Nije dodijeljeno'}
                                  </span>
                                </td>

                                <td className="py-3 px-3">
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

                                <td className="py-3 px-3 max-w-[220px]">
                                  {spor.presudaTroskovi ? (
                                    <div>
                                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                        {spor.presudaTroskovi}
                                      </p>
                                      {spor.datumZapPresude && (
                                        <p className="text-2xs text-slate-400">Zaprimljeno: {spor.datumZapPresude}</p>
                                      )}
                                      {spor.troskoviInfo && spor.troskoviInfo.imaTroskova && (
                                        <div className="mt-1">
                                          {spor.troskoviInfo.status === 'poslan_nalog' ? (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                                              <Check className="w-3 h-3" /> Nalog poslan
                                            </span>
                                          ) : spor.troskoviInfo.status === 'placeno' ? (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                                              <Check className="w-3 h-3" /> Plaćeno
                                            </span>
                                          ) : (
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold ${
                                              ['isteklo', 'danas', 'kriticno'].includes(spor.troskoviInfo.hitnost)
                                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 animate-pulse'
                                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                            }`}>
                                              💰 {spor.troskoviInfo.iznos || 'Trošak'}
                                              {spor.troskoviInfo.rokPlacanja && ` (rok: ${spor.troskoviInfo.rokPlacanja})`}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-2xs">U tijeku</span>
                                  )}
                                </td>

                                <td className="py-3 px-3 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSpor(isSelected ? null : spor);
                                    }}
                                    className={`px-2.5 py-1 rounded text-2xs font-semibold transition-colors ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60'
                                    }`}
                                  >
                                    {isSelected ? 'Sakrij ▲' : 'Detalji ▼'}
                                  </button>
                                </td>
                              </tr>

                              {/* INLINE DETALJI DIREKTNO ISPOD KLIKNUTOG SPORA */}
                              {isSelected && (
                                <tr className="bg-slate-50/95 dark:bg-slate-850/95 border-y-2 border-indigo-200 dark:border-indigo-900/60">
                                  <td colSpan={8} className="p-4 sm:p-5">
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                                            {spor.poslovniBroj || 'Bez broja'} — {spor.tuzitelj}
                                          </span>
                                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
                                            {spor.sud}
                                          </span>
                                          {spor.oib && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-slate-700 dark:text-slate-300">
                                              OIB: {spor.oib}
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSpor(null);
                                          }}
                                          className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                                        >
                                          Zatvori detalje ✕
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                        {/* Kartica 1: Tužba i rokovi */}
                                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs space-y-2">
                                          <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                            Tužba & Rok suda
                                          </p>
                                          <div className="space-y-1 text-slate-700 dark:text-slate-300">
                                            <p><span className="text-slate-400">Preuzeto s e-Kom:</span> <strong>{spor.tuzbaPreuzeta || '-'}</strong></p>
                                            <p><span className="text-slate-400">Rok suda:</span> <strong className={spor.rokDatum ? 'text-rose-600 dark:text-rose-400' : ''}>{spor.rokDatum || 'Nema određenog roka'}</strong></p>
                                            <p><span className="text-slate-400">Odgovor na tužbu:</span> <strong>{spor.odgovorNaTuzbu || 'Nije poslano'}</strong></p>
                                            {spor.isSutnjaUprave && (
                                              <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-2xs">
                                                <strong>Šutnja uprave (čl. 24. ZUS):</strong> Provjeriti je li spis dostavljen sudu i pripremiti drugostupanjski akt.
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Kartica 2: Dosuđeni troškovi i paricijski rok */}
                                        <div className={`p-3.5 rounded-xl border shadow-2xs space-y-2 ${
                                          spor.troskoviInfo?.status === 'neplaceno'
                                            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                                            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/80'
                                        }`}>
                                          <p className="text-2xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <span>💰</span> Dosuđeni troškovi & Rok
                                          </p>
                                          {spor.troskoviInfo && spor.troskoviInfo.imaTroskova ? (
                                            <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                                              {spor.troskoviInfo.iznos && (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-slate-500">Iznos:</span>
                                                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{spor.troskoviInfo.iznos}</span>
                                                </div>
                                              )}
                                              <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Status:</span>
                                                {spor.troskoviInfo.status === 'poslan_nalog' ? (
                                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Nalog poslan računovodstvu</span>
                                                ) : spor.troskoviInfo.status === 'placeno' ? (
                                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Plaćeno</span>
                                                ) : (
                                                  <span className="font-bold text-rose-600 dark:text-rose-400">⚠️ Čeka nalog / Nije plaćeno</span>
                                                )}
                                              </div>

                                              {spor.troskoviInfo.rokPlacanja && (
                                                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-2xs space-y-1">
                                                  <div className="flex items-center justify-between font-semibold">
                                                    <span className="text-slate-600 dark:text-slate-400">Rok dospijeća:</span>
                                                    <span className="text-rose-600 dark:text-rose-400">{spor.troskoviInfo.rokPlacanja}</span>
                                                  </div>
                                                  {spor.troskoviInfo.danaDoRoka !== null && spor.troskoviInfo.danaDoRoka !== undefined && (
                                                    <p className="text-slate-500">
                                                      {spor.troskoviInfo.danaDoRoka < 0
                                                        ? `Rok je istekao prije ${Math.abs(spor.troskoviInfo.danaDoRoka)} dana!`
                                                        : spor.troskoviInfo.danaDoRoka === 0
                                                        ? 'Danas istječe rok za isplatu!'
                                                        : `Preostalo još ${spor.troskoviInfo.danaDoRoka} dana za isplatu`}
                                                    </p>
                                                  )}
                                                </div>
                                              )}

                                              <div className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-2xs text-slate-600 dark:text-slate-400">
                                                <p className="font-medium text-slate-700 dark:text-slate-300">Pravilo paricijskog roka:</p>
                                                <p className="mt-0.5">
                                                  &quot;15 dana od pravomoćnosti&quot; = 15 dana za žalbu na VUSRH + 15 dana paricijski rok (ukupno 30 dana od dana primitka presude).
                                                </p>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="text-slate-400 italic py-2">U ovom predmetu nisu evidentirani dosuđeni troškovi protiv Ministarstva.</p>
                                          )}
                                        </div>

                                        {/* Kartica 3: Presuda i pravni lijekovi */}
                                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs space-y-2">
                                          <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                                            Presuda & Ishod
                                          </p>
                                          <div className="space-y-1 text-slate-700 dark:text-slate-300">
                                            <p><span className="text-slate-400">Odluka suda:</span> <strong>{spor.presudaTroskovi || 'Još nema presude (u radu)'}</strong></p>
                                            <p><span className="text-slate-400">Datum zaprimanja:</span> <strong>{spor.datumZapPresude || '-'}</strong></p>
                                            <p><span className="text-slate-400">Žalba / VUSRH:</span> <strong>{spor.visokiUpravniSud || spor.zalbaPresuda || 'Nije podnesena / Pravomoćno'}</strong></p>
                                            <p><span className="text-slate-400">Akt UP/II po presudi:</span> <strong>{spor.aktUpIiPoPresudi || '-'}</strong></p>
                                          </div>
                                        </div>

                                        {/* Kartica 4: Predmet i napomena */}
                                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs space-y-2">
                                          <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-purple-500" />
                                            Predmet & Rješavatelj
                                          </p>
                                          <div className="space-y-1 text-slate-700 dark:text-slate-300">
                                            <p><span className="text-slate-400">Rješavatelj:</span> <strong>{spor.rjesavatelj || '-'}</strong></p>
                                            <p><span className="text-slate-400">Vrsta predmeta:</span> <strong>{spor.predmet || '-'}</strong></p>
                                            <p><span className="text-slate-400">Pobijani akt:</span> <strong>{spor.upIiRjesenje || '-'}</strong></p>
                                            {spor.vrijednostNapomena && (
                                              <div className="mt-2 p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-2xs">
                                                <span className="text-slate-400 font-semibold">Napomena:</span> {spor.vrijednostNapomena}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: RADAR ROKOVA */}
          {sporoviSubTab === 'radar' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 flex items-start gap-3">
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
                    Nema hitnih rokova u ovom trenutku! Svi odgovori su evidentirani.
                  </div>
                ) : (
                  radarSporovi.map((spor) => (
                    <div
                      key={spor.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2 hover:border-indigo-300 transition-colors"
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

                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
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

          {/* SUB-TAB 3: UVOZ IZ E-KOMUNIKACIJE (KORAK 2) */}
          {sporoviSubTab === 'uvoz' && (
            <div className="space-y-6">
              {saveSuccessMsg && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-sm">{saveSuccessMsg}</span>
                  </div>
                  <button
                    onClick={() => {
                      setSaveSuccessMsg('');
                      setExtractedData(null);
                      setQueuedFiles([]);
                    }}
                    className="text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Novi uvoz
                  </button>
                </div>
              )}

              {saveErrorMsg && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{saveErrorMsg}</span>
                </div>
              )}

              {!extractedData ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* DROPZONE */}
                  <div className="lg:col-span-2 space-y-4">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        if (e.dataTransfer.files) {
                          const newFiles = Array.from(e.dataTransfer.files).filter((f) =>
                            f.name.toLowerCase().endsWith('.pdf')
                          );
                          setQueuedFiles((prev) => [...prev, ...newFiles]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all ${
                        isDragOver
                          ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 scale-[1.01]'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            const newFiles = Array.from(e.target.files);
                            setQueuedFiles((prev) => [...prev, ...newFiles]);
                          }
                        }}
                      />

                      <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                        <Upload className="w-6 h-6" />
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Povucite (Drag & Drop) paket dokumenata s e-Komunikacije
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                        Odaberite PDF datoteke koje ste skinuli s e-Komunikacije (Tužba, Dopis suda s rokom, Potvrda primitka pošiljke).
                      </p>
                    </div>

                    {queuedFiles.length > 0 && (
                      <div className="p-4 bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Priloženi dokumenti paketa ({queuedFiles.length}):
                          </p>
                          <button
                            onClick={() => setQueuedFiles([])}
                            className="text-2xs text-rose-600 hover:underline"
                          >
                            Ukloni sve
                          </button>
                        </div>

                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {queuedFiles.map((file, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                <span className="truncate font-medium">{file.name}</span>
                              </div>
                              <span className="text-2xs text-slate-400 shrink-0 ml-2">
                                {(file.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={handleAnalyzeFiles}
                          disabled={isAnalyzing}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xs"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>{analysisStep || 'Analiza u tijeku...'}</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Pokreni AI analizu paketa</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* BRZI ODABIR IZ MAPA NA ONEDRIVE-U */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        ⚡ Brzi uvoz iz mape na OneDrive-u
                      </h4>
                    </div>

                    <p className="text-2xs text-slate-500 dark:text-slate-400">
                      Kliknite na nedavno skinutu mapu iz <code>e_komunikacija sa sudovima</code> za instant analizu:
                    </p>

                    <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                      {loadingFolders ? (
                        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          <span>Učitavanje mapa...</span>
                        </div>
                      ) : oneDriveFolders.length === 0 ? (
                        <p className="text-2xs text-slate-400 italic">Nema pronađenih mapa na navedenoj putanji.</p>
                      ) : (
                        oneDriveFolders.map((f) => (
                          <button
                            key={f.name}
                            onClick={() => handleAnalyzeFromFolder(f.name)}
                            disabled={isAnalyzing}
                            className="w-full text-left p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 transition-colors text-xs group"
                          >
                            <p className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                              {f.name}
                            </p>
                            <p className="text-2xs text-slate-400 mt-0.5">
                              {new Date(f.mtime).toLocaleDateString('hr-HR')}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* INTERAKTIVNI OBRAZAC ZA PREGLED I SPREMANJE */
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-xs animate-in fade-in-50 duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Uspješno očitani podaci sa suda
                        </span>
                        {extractedData.vrstaSpora === 'Šutnja uprave' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Šutnja uprave
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                        {formPoslovniBroj} — {formTuzitelj}
                      </h3>
                    </div>

                    <button
                      onClick={() => {
                        setExtractedData(null);
                        setQueuedFiles([]);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Poništi i učitaj drugi paket
                    </button>
                  </div>

                  {extractedData.povezaniPredmet && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>Povezano s drugostupanjskim predmetom u bazi:</strong>{' '}
                        {extractedData.povezaniPredmet.klasa} ({extractedData.povezaniPredmet.stranka})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Nadležni sud:
                      </label>
                      <input
                        type="text"
                        value={formSud}
                        onChange={(e) => setFormSud(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Poslovni broj suda:
                      </label>
                      <input
                        type="text"
                        value={formPoslovniBroj}
                        onChange={(e) => setFormPoslovniBroj(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-indigo-600 dark:text-indigo-400"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Tužitelj:
                      </label>
                      <input
                        type="text"
                        value={formTuzitelj}
                        onChange={(e) => setFormTuzitelj(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        OIB tužitelja:
                      </label>
                      <input
                        type="text"
                        value={formOib}
                        onChange={(e) => setFormOib(e.target.value)}
                        placeholder="11-znamenkasti OIB"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Vrsta spora:
                      </label>
                      <select
                        value={formVrstaSpora}
                        onChange={(e) => setFormVrstaSpora(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      >
                        <option value="Šutnja uprave">Šutnja uprave (čl. 24. ZUS)</option>
                        <option value="Pobijanje rješenja">Pobijanje drugostupanjskog rješenja</option>
                        <option value="Upravni spor">Ostali upravni sporovi</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Pravno područje / Predmet:
                      </label>
                      <input
                        type="text"
                        value={formPredmet}
                        onChange={(e) => setFormPredmet(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Pobijani akt / Klasa:
                      </label>
                      <input
                        type="text"
                        value={formPobijaniAkt}
                        onChange={(e) => setFormPobijaniAkt(e.target.value)}
                        placeholder="npr. šutnja uprave ili KLASA: UP/II-..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Datum primitka (e-Komunikacija):
                      </label>
                      <input
                        type="date"
                        value={formDatumPreuzimanja}
                        onChange={(e) => setFormDatumPreuzimanja(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Zadani rok suda:
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          value={formRokDana}
                          onChange={(e) => setFormRokDana(parseInt(e.target.value, 10))}
                          className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                        >
                          <option value={30}>30 dana</option>
                          <option value={60}>60 dana</option>
                          <option value={15}>15 dana</option>
                        </select>
                        <span className="text-2xs text-slate-500">➔ Istek:</span>
                        <input
                          type="text"
                          value={formRokDospijeca}
                          onChange={(e) => setFormRokDospijeca(e.target.value)}
                          className="flex-1 px-2.5 py-2 rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Rješavatelj:
                      </label>
                      <input
                        type="text"
                        value={formRjesavatelj}
                        onChange={(e) => setFormRjesavatelj(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        AI Sažetak tužbenih navoda:
                      </label>
                      <textarea
                        rows={2}
                        value={formSazetak}
                        onChange={(e) => setFormSazetak(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      onClick={handleSaveNewSpor}
                      disabled={isSaving}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xs"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Spremanje...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>💾 Spremi u evidenciju sporova</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2 text-2xs text-slate-500">
                      <span>Nakon spremanja, predmet se odmah prikazuje u Radaru rokova i Tablici sporova.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: DRUGOSTUPANJSKI UPRAVNI PREDMETI (ZUP) */}
      {mainView === 'zup' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-2xs">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  Drugostupanjski upravni predmeti (ZUP)
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Žalbeni predmeti u radu, praćenje zakonskog roka (60 dana - čl. 121. ZUP) i faze obrade
                </p>
              </div>
            </div>

            <NewPredmetButton />
          </header>

          <PredmetiTable initialPredmeti={initialPredmeti} type="aktivni" />
        </div>
      )}
    </div>
  );
}
