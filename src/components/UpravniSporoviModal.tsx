'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Sparkles,
  Upload,
  Calendar,
  FileCheck,
  Check,
  Loader2,
  Link as LinkIcon,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  getUpravniSporoviAction,
  analyzeCourtPacketAction,
  listOneDriveFoldersAction,
  analyzeFromOneDriveFolderAction,
  saveNewSporAction,
  updateSporManualDetailsAction,
  dismissSporAction,
  type SporoviStats,
} from '@/app/actions/sporoviActions';
import type { UpravniSpor } from '@/lib/upravni-sporovi';
import type { ExtractedCourtCase } from '@/lib/court-packet-parser';

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
  const [statusFilter, setStatusFilter] = useState<
    'sve' | 'u_radu' | 'hitno' | 'sutnja' | 'troskovi' | 'troskovi_zuto' | 'troskovi_smedje' | 'troskovi_rijeseno' | 'troskovi_sve' | 'rijeseno' | 'uklonjeno'
  >('u_radu');
  const [rjesavateljFilter, setRjesavateljFilter] = useState('sve');
  const [sporoviSort, setSporoviSort] = useState<'novi' | 'stari' | 'rok' | 'stranka' | 'sud'>('novi');
  const [selectedSpor, setSelectedSpor] = useState<UpravniSpor | null>(null);

  // Ručno uređivanje detalja spora
  const [editingSporId, setEditingSporId] = useState<string | null>(null);
  const [editAktUpIi, setEditAktUpIi] = useState('');
  const [editOdgovor, setEditOdgovor] = useState('');
  const [editPresuda, setEditPresuda] = useState('');
  const [editDatumPresude, setEditDatumPresude] = useState('');
  const [editZalba, setEditZalba] = useState('');
  const [editVus, setEditVus] = useState('');
  const [editRjesavatelj, setEditRjesavatelj] = useState('');
  const [editNapomena, setEditNapomena] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState('');

  // Uklanjanje / Vraćanje spora
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissSuccessMsg, setDismissSuccessMsg] = useState<string>('');

  const handleDismissSpor = async (spor: UpravniSpor, unDismiss = false) => {
    setDismissingId(spor.id);
    try {
      const res = await dismissSporAction({
        id: spor.id,
        poslovniBroj: spor.poslovniBroj,
        reason: unDismiss ? undefined : 'Ručno uklonjeno iz evidencije aktivnih sporova',
        unDismiss,
      });

      if (res.success) {
        const updated = res.updatedSpor;
        // Lokalno označi predmet (ne oslanjamo se samo na odgovor servera)
        setSporovi((prev) =>
          prev.map((s) =>
            s.id === spor.id
              ? updated && updated.id === spor.id
                ? { ...updated, isDismissed: !unDismiss }
                : { ...s, isDismissed: !unDismiss }
              : s
          )
        );
        setSelectedSpor(null);
        setEditingSporId(null);
        setStats((prev) =>
          prev ? { ...prev, uklonjeni: Math.max(0, prev.uklonjeni + (unDismiss ? -1 : 1)) } : prev
        );
        const msg = unDismiss
          ? `✓ Predmet ${spor.poslovniBroj || spor.tuzitelj} vraćen je u aktivne sporove!`
          : `✓ Predmet ${spor.poslovniBroj || spor.tuzitelj} uklonjen je iz aktivnih sporova!`;
        setDismissSuccessMsg(msg);
        setTimeout(() => setDismissSuccessMsg(''), 5000);
      } else {
        alert(`Predmet nije uklonjen – greška pri spremanju:\n${res.error || 'nepoznata greška'}`);
      }
    } catch (err) {
      alert(`Predmet nije uklonjen – greška: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Greška pri uklanjanju spora:', err);
    } finally {
      setDismissingId(null);
    }
  };

  const startEditingSpor = (spor: UpravniSpor) => {
    setEditingSporId(spor.id);
    setEditAktUpIi(spor.aktUpIiPoPresudi || '');
    setEditOdgovor(spor.odgovorNaTuzbu || '');
    setEditPresuda(spor.presudaTroskovi || '');
    setEditDatumPresude(spor.datumZapPresude || '');
    setEditZalba(spor.zalbaPresuda || '');
    setEditVus(spor.visokiUpravniSud || '');
    setEditRjesavatelj(spor.rjesavatelj || '');
    setEditNapomena(spor.vrijednostNapomena || '');
    setEditSuccessMsg('');
  };

  const handleSaveSporEdit = async (spor: UpravniSpor) => {
    setIsSavingEdit(true);
    try {
      const res = await updateSporManualDetailsAction({
        id: spor.id,
        poslovniBroj: spor.poslovniBroj,
        aktUpIiPoPresudi: editAktUpIi,
        odgovorNaTuzbu: editOdgovor,
        presudaTroskovi: editPresuda,
        datumZapPresude: editDatumPresude,
        zalbaPresuda: editZalba,
        visokiUpravniSud: editVus,
        rjesavatelj: editRjesavatelj,
        vrijednostNapomena: editNapomena,
      });

      if (res.success && res.updatedSpor) {
        const updated = res.updatedSpor;
        setSporovi((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setSelectedSpor(updated);
        setEditingSporId(null);
        setEditSuccessMsg(`✓ Zabilješke za predmet ${updated.poslovniBroj || updated.tuzitelj} uspješno spremljene!`);
        setTimeout(() => setEditSuccessMsg(''), 5000);
      }
    } catch (err) {
      console.error('Greška pri spremanju izmjena spora:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // TAB 3: UVOZ IZ E-KOMUNIKACIJE STATES
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedCourtCase | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OneDrive folders list
  const [oneDriveFolders, setOneDriveFolders] = useState<{ name: string; mtime: string }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedOneDriveFolder, setSelectedOneDriveFolder] = useState('');

  // Editable Form states for extracted data
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

  const loadOneDriveFolders = async () => {
    setLoadingFolders(true);
    try {
      const res = await listOneDriveFoldersAction();
      if (res.success) {
        setOneDriveFolders(res.folders);
      }
    } catch (err) {
      console.error('Greška pri listanju mapa OneDrive-a:', err);
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData(false);
      loadOneDriveFolders();
    }
  }, [isOpen]);

  // Sync extracted data to editable form
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

  // Run analysis on uploaded files
  const handleAnalyzeFiles = async () => {
    if (queuedFiles.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisStep('Čitanje i OCR priprema PDF datoteka...');

    try {
      const fd = new FormData();
      queuedFiles.forEach((f) => fd.append('files', f));

      setAnalysisStep('Ekstrakcija podataka sa suda, potvrde primitka i rokova...');
      const res = await analyzeCourtPacketAction(fd);

      if (res.success && res.data) {
        setAnalysisStep('Dovršeno!');
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

  // Run analysis from an existing OneDrive folder with 1-click
  const handleAnalyzeFromFolder = async (folderName: string) => {
    setSelectedOneDriveFolder(folderName);
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

  // Save new dispute to active list
  const handleSaveNewSpor = async () => {
    if (!formPoslovniBroj || !formTuzitelj) {
      setSaveErrorMsg('Poslovni broj i tužitelj su obavezna polja.');
      return;
    }

    setIsSaving(true);
    setSaveErrorMsg('');
    try {
      const dPreuzetoParts = formDatumPreuzimanja.split('-');
      const formattedPreuzeto =
        dPreuzetoParts.length === 3
          ? `${parseInt(dPreuzetoParts[2], 10)}.${parseInt(dPreuzetoParts[1], 10)}.${dPreuzetoParts[0]}.`
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
        setSaveSuccessMsg(`Predmet ${formPoslovniBroj} (${formTuzitelj}) uspješno je spremljen u evidenciju sporova!`);
        await loadData(false);
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
    const hasSearch = !!searchQuery.trim();
    const q = searchQuery.toLowerCase().trim();

    const list = sporovi.filter((s) => {
      // Text search
      if (hasSearch) {
        const matchesText =
          s.tuzitelj.toLowerCase().includes(q) ||
          s.poslovniBroj.toLowerCase().includes(q) ||
          (s.oib && s.oib.includes(q)) ||
          s.upIiRjesenje.toLowerCase().includes(q) ||
          s.rjesavatelj.toLowerCase().includes(q) ||
          s.predmet.toLowerCase().includes(q) ||
          s.sud.toLowerCase().includes(q) ||
          (s.presudaTroskovi && s.presudaTroskovi.toLowerCase().includes(q)) ||
          (s.zalbaPresuda && s.zalbaPresuda.toLowerCase().includes(q)) ||
          (s.aktUpIiPoPresudi && s.aktUpIiPoPresudi.toLowerCase().includes(q)) ||
          (s.vrijednostNapomena && s.vrijednostNapomena.toLowerCase().includes(q)) ||
          (s.troskoviInfo?.iznos && s.troskoviInfo.iznos.toLowerCase().includes(q)) ||
          (s.troskoviInfo?.opis && s.troskoviInfo.opis.toLowerCase().includes(q));

        if (!matchesText) return false;

        // Kad korisnik traži određeni pojam, ne blokiramo statusnim filterom
        // Uklonjeni predmeti se ipak skrivaju (osim u filtru "Uklonjeni predmeti").
        if (statusFilter === 'uklonjeno' ? !s.isDismissed : s.isDismissed) return false;
        if (sudFilter !== 'sve' && s.sud !== sudFilter) return false;
        if (rjesavateljFilter !== 'sve' && s.rjesavatelj !== rjesavateljFilter) return false;
        return true;
      }

      // Sud filter
      if (sudFilter !== 'sve' && s.sud !== sudFilter) return false;

      // Rješavatelj filter
      if (rjesavateljFilter !== 'sve' && s.rjesavatelj !== rjesavateljFilter) return false;

      // Filter uklonjenih predmeta
      if (statusFilter === 'uklonjeno') {
        return !!s.isDismissed;
      }

      // U redovnim prikazima sakrij uklonjene predmete
      if (s.isDismissed) return false;

      // Status filter
      if (statusFilter === 'u_radu') {
        if (s.isPresudeno) return false;
      } else if (statusFilter === 'hitno') {
        if (!['isteklo', 'danas', 'kriticno', 'hitno'].includes(s.hitnost)) return false;
      } else if (statusFilter === 'sutnja') {
        if (!s.isSutnjaUprave) return false;
      } else if (statusFilter === 'troskovi' || statusFilter === 'troskovi_zuto') {
        if (!s.troskoviInfo?.imaTroskova) return false;
        if (
          s.troskoviInfo.status === 'placeno' ||
          s.troskoviInfo.status === 'poslan_nalog' ||
          s.troskoviInfo.bojaOznake === 'smedje'
        ) {
          return false;
        }
      } else if (statusFilter === 'troskovi_smedje' || statusFilter === 'troskovi_rijeseno') {
        if (!s.troskoviInfo?.imaTroskova) return false;
        const isRijeseno =
          s.troskoviInfo.status === 'poslan_nalog' ||
          s.troskoviInfo.status === 'placeno' ||
          s.troskoviInfo.bojaOznake === 'smedje';
        if (!isRijeseno) return false;
      } else if (statusFilter === 'troskovi_sve') {
        if (!s.troskoviInfo?.imaTroskova) return false;
      } else if (statusFilter === 'rijeseno') {
        if (!s.isPresudeno) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sporoviSort === 'novi') {
        return b.rbr - a.rbr;
      }
      if (sporoviSort === 'stari') {
        return a.rbr - b.rbr;
      }
      if (sporoviSort === 'rok') {
        return (a.danaDoRoka ?? 999) - (b.danaDoRoka ?? 999);
      }
      if (sporoviSort === 'stranka') {
        return a.tuzitelj.localeCompare(b.tuzitelj, 'hr');
      }
      if (sporoviSort === 'sud') {
        return a.sud.localeCompare(b.sud, 'hr');
      }
      return b.rbr - a.rbr;
    });

    return list;
  }, [sporovi, searchQuery, sudFilter, statusFilter, rjesavateljFilter, sporoviSort]);

  // Radar hitni sporovi (sorted by deadline urgency, bez uklonjenih)
  const radarSporovi = useMemo(() => {
    return sporovi
      .filter((s) => !s.isDismissed && ['isteklo', 'danas', 'kriticno', 'hitno', 'u_roku'].includes(s.hitnost) && !s.isPresudeno)
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-6 py-3.5 bg-slate-50/40 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-800/80 text-xs">
          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('u_radu');
            }}
            className={`cursor-pointer p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
              statusFilter === 'u_radu' && activeTab === 'pregled'
                ? 'border-blue-400 bg-blue-50/80 dark:bg-blue-950/40 shadow-xs'
                : 'border-blue-200/70 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-50'
            }`}
          >
            <div>
              <p className="text-blue-600 dark:text-blue-400 font-medium">U radu / Bez presude</p>
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
                Radar rokova
              </p>
              <p className="text-lg font-bold text-rose-950 dark:text-rose-100">{stats?.hitni ?? 0}</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>

          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('troskovi_zuto');
            }}
            className={`cursor-pointer p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
              (statusFilter === 'troskovi' || statusFilter === 'troskovi_zuto') && activeTab === 'pregled'
                ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 shadow-xs'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 hover:border-amber-300'
            }`}
          >
            <div>
              <p className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1 text-xs">
                <span>🟡</span> Troškovi za isplatu
              </p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-lg font-bold text-amber-950 dark:text-amber-100">{stats?.troskoviZuto ?? 0}</p>
                <span className="text-2xs text-amber-600">čeka nalog</span>
              </div>
              <p className="text-2xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                🟢 {stats?.troskoviRijeseno ?? 0} nalog poslan - plaćeno
              </p>
            </div>
            <span className="text-base">💰</span>
          </div>

          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('sutnja');
            }}
            className={`cursor-pointer p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
              statusFilter === 'sutnja' && activeTab === 'pregled'
                ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 shadow-xs'
                : 'border-amber-200/70 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-50'
            }`}
          >
            <div>
              <p className="text-amber-700 dark:text-amber-400 font-medium">Šutnja uprave</p>
              <p className="text-lg font-bold text-amber-950 dark:text-amber-100">{stats?.sutnjaUprave ?? 0}</p>
            </div>
            <ShieldAlert className="w-5 h-5 text-amber-500/70" />
          </div>

          <div
            onClick={() => {
              setActiveTab('pregled');
              setStatusFilter('rijeseno');
            }}
            className={`cursor-pointer p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
              statusFilter === 'rijeseno' && activeTab === 'pregled'
                ? 'border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-xs'
                : 'border-emerald-200/70 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-50'
            }`}
          >
            <div>
              <p className="text-emerald-700 dark:text-emerald-400 font-medium">Presuđeno</p>
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
            <span className="px-1.5 py-0.2 rounded-full text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              AI Parser
            </span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: PREGLED SVIH SPOROVA */}
          {activeTab === 'pregled' && (
            <div className="space-y-4">
              {/* OBAVIJEST O UKLANJANJU */}
              {dismissSuccessMsg && (
                <div className="p-3 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center justify-between shadow-lg">
                  <span>{dismissSuccessMsg}</span>
                  <button onClick={() => setDismissSuccessMsg('')} className="text-slate-400 hover:text-white dark:hover:text-black">
                    ✕
                  </button>
                </div>
              )}

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
                    className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
                  >
                    <option value="u_radu">U radu / Bez presude ({stats?.uTijeku ?? 0})</option>
                    <option value="hitno">Hitni rokovi odgovora ({stats?.hitni ?? 0})</option>
                    <option value="troskovi_zuto">🟡 Troškovi za plaćanje / Čeka nalog ({stats?.troskoviZuto ?? 0})</option>
                    <option value="troskovi_rijeseno">🟢 Nalog poslan - plaćeno ({stats?.troskoviRijeseno ?? 0})</option>
                    <option value="troskovi_sve">💰 Svi dosuđeni troškovi ({stats?.troskoviUkupno ?? 0})</option>
                    <option value="sutnja">Šutnja uprave ({stats?.sutnjaUprave ?? 0})</option>
                    <option value="rijeseno">Presuđeno / Završeno ({stats?.presudeni ?? 0})</option>
                    {(stats?.uklonjeni ?? 0) > 0 && (
                      <option value="uklonjeno">🗑️ Uklonjeni predmeti ({stats?.uklonjeni ?? 0})</option>
                    )}
                    <option value="sve">Svi sporovi ({stats?.total ?? sporovi.length})</option>
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

                  {/* Redoslijed / Sortiranje */}
                  <select
                    value={sporoviSort}
                    onChange={(e) => setSporoviSort(e.target.value as any)}
                    className="px-2.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 font-semibold"
                  >
                    <option value="novi">Sort: Najnoviji prvi</option>
                    <option value="stari">Sort: Najstariji prvi</option>
                    <option value="rok">Sort: Po roku (hitno)</option>
                    <option value="stranka">Sort: Tužitelj (A–Ž)</option>
                    <option value="sud">Sort: Sud (A–Ž)</option>
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
                        <th className="py-2.5 px-3">Presuda & Troškovi</th>
                        <th className="py-2.5 px-3 text-right">Radnja</th>
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
                        filteredSporovi.map((spor, index) => {
                          const isSelected = selectedSpor?.id === spor.id;
                          return (
                            <React.Fragment key={spor.id}>
                              <tr
                                onClick={() => setSelectedSpor(isSelected ? null : spor)}
                                className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                                  isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-medium' : ''
                                } ${spor.isDismissed ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40' : ''}`}
                              >
                                <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-2xs font-bold">
                                  {index + 1}
                                </td>

                                {/* Poslovni broj & Sud */}
                                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                        {spor.poslovniBroj || 'Bez broja'}
                                      </span>
                                      {spor.isDismissed && (
                                        <span className="px-1.5 py-0.2 rounded text-3xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                          Uklonjeno
                                        </span>
                                      )}
                                    </div>
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
                                  {spor.isDismissed ? (
                                    <span className="text-2xs text-slate-400 italic">Uklonjeno iz aktivnih</span>
                                  ) : (
                                    <>
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
                                    </>
                                  )}
                                </td>

                                {/* Presuda & Troškovi */}
                                <td className="py-2.5 px-3 max-w-[240px]">
                                  {/* Istaknuti bedževi za troškove spora - UJEDINJENO U ZELENO */}
                                  {spor.troskoviInfo && spor.troskoviInfo.imaTroskova && (
                                    <div className="mb-1">
                                      {spor.troskoviInfo.status === 'placeno' ||
                                      spor.troskoviInfo.status === 'poslan_nalog' ||
                                      spor.troskoviInfo.bojaOznake === 'smedje' ? (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                                          title={spor.troskoviInfo.opis}
                                        >
                                          ✓ {spor.troskoviInfo.nalogDatum
                                            ? `Nalog poslan ${spor.troskoviInfo.nalogDatum} - plaćeno`
                                            : spor.troskoviInfo.status === 'poslan_nalog' || spor.troskoviInfo.bojaOznake === 'smedje'
                                            ? 'Nalog poslan - plaćeno'
                                            : 'Plaćeno'}
                                          {spor.troskoviInfo.iznos ? ` (${spor.troskoviInfo.iznos})` : ''}
                                        </span>
                                      ) : (
                                        <span
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-bold ${
                                            ['isteklo', 'danas', 'kriticno'].includes(spor.troskoviInfo.hitnost)
                                              ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border border-rose-400 animate-pulse'
                                              : 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200 border border-amber-400 shadow-2xs'
                                          }`}
                                          title={spor.troskoviInfo.opis}
                                        >
                                          🟡 Trošak: {spor.troskoviInfo.iznos || '1.250 EUR'} (ČEKA NALOG)
                                          {spor.troskoviInfo.rokPlacanja && ` (rok: ${spor.troskoviInfo.rokPlacanja})`}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {spor.presudaTroskovi ? (
                                    <div>
                                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate" title={spor.presudaTroskovi}>
                                        {spor.presudaTroskovi}
                                      </p>
                                      {spor.datumZapPresude && (
                                        <p className="text-2xs text-slate-400">Zaprimljeno: {spor.datumZapPresude}</p>
                                      )}
                                    </div>
                                  ) : !spor.troskoviInfo?.imaTroskova ? (
                                    <span className="text-slate-400 text-2xs">U tijeku</span>
                                  ) : null}
                                </td>

                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSpor(isSelected ? null : spor);
                                    }}
                                    className={`px-2 py-1 rounded text-2xs font-semibold transition-colors ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60'
                                    }`}
                                  >
                                    {isSelected ? 'Sakrij ▲' : 'Detalji ▼'}
                                  </button>
                                </td>
                              </tr>

                              {/* INLINE DETALJI DIREKTNO ISPOD SPORA */}
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
                                          {spor.hasManualOverride && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-medium border border-blue-200 dark:border-blue-800">
                                              ✏️ Ručno evidentirano
                                            </span>
                                          )}
                                          {spor.isDismissed && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-medium border border-rose-200 dark:border-rose-800">
                                              🗑️ Uklonjeno iz aktivnih sporova
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          {spor.isDismissed ? (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDismissSpor(spor, true);
                                              }}
                                              disabled={dismissingId === spor.id}
                                              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                                            >
                                              <RotateCcw className="w-3.5 h-3.5" />
                                              <span>↩️ Vrati u aktivne sporove</span>
                                            </button>
                                          ) : (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (
                                                  confirm(
                                                    `Želite li ukloniti predmet ${spor.poslovniBroj || spor.tuzitelj} iz aktivnih sporova?\n\n(Predmet neće više stvarati hitne alarme na radaru rokova, a moći ćete ga pregledati pod filtrom "Uklonjeni predmeti" ili ga vratiti.)`
                                                  )
                                                ) {
                                                  handleDismissSpor(spor, false);
                                                }
                                              }}
                                              disabled={dismissingId === spor.id}
                                              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                              title="Ukloni ovaj predmet ako je zastario ili nema evidentiran ishod (npr. istekli rok prije više godina)"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                              <span>🗑️ Ukloni iz aktivnih</span>
                                            </button>
                                          )}

                                          {editingSporId === spor.id ? (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingSporId(null);
                                              }}
                                              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            >
                                              Odustani
                                            </button>
                                          ) : (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                startEditingSpor(spor);
                                              }}
                                              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                                            >
                                              <Pencil className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                              <span>Uredi zabilješke / Dodaj rješenje</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedSpor(null);
                                              setEditingSporId(null);
                                            }}
                                            className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                          >
                                            Zatvori detalje ✕
                                          </button>
                                        </div>
                                      </div>

                                      {editSuccessMsg && (
                                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
                                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                          <span>{editSuccessMsg}</span>
                                        </div>
                                      )}

                                      {editingSporId === spor.id ? (
                                        /* FORMA ZA RUČNO UREĐIVANJE DETALJA SPORA */
                                        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 shadow-2xs space-y-4">
                                          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                              <Pencil className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                              <span>Uređivanje zabilješki i podataka: {spor.poslovniBroj || spor.tuzitelj}</span>
                                            </p>
                                            <span className="text-2xs text-slate-400">Podaci se trajno spremaju u aplikaciji</span>
                                          </div>

                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                            <div className="space-y-1">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Akt UP/II po presudi / Novodoneseno rješenje:
                                              </label>
                                              <input
                                                type="text"
                                                value={editAktUpIi}
                                                onChange={(e) => setEditAktUpIi(e.target.value)}
                                                placeholder="npr. Rješenje KLASA: UP/II-361-05/26-01/123 doneseno 15.10.2026."
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                                              />
                                            </div>

                                            <div className="space-y-1">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Odgovor na tužbu / Status spisa:
                                              </label>
                                              <input
                                                type="text"
                                                value={editOdgovor}
                                                onChange={(e) => setEditOdgovor(e.target.value)}
                                                placeholder="npr. rok 11.11.2026. - 9.11.2026. odgovor u KP"
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                              />
                                            </div>

                                            <div className="space-y-1">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Presuda suda & Dosuđeni troškovi:
                                              </label>
                                              <input
                                                type="text"
                                                value={editPresuda}
                                                onChange={(e) => setEditPresuda(e.target.value)}
                                                placeholder="npr. Presuda od 10.10.2026. - odbijena tužba ili 1250 eur trošak"
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                              />
                                            </div>

                                            <div className="space-y-1">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Datum zaprimanja presude:
                                              </label>
                                              <input
                                                type="text"
                                                value={editDatumPresude}
                                                onChange={(e) => setEditDatumPresude(e.target.value)}
                                                placeholder="npr. 12.10.2026."
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                              />
                                            </div>

                                            <div className="space-y-1">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Žalba na presudu / Visoki upravni sud (VUSRH):
                                              </label>
                                              <input
                                                type="text"
                                                value={editZalba}
                                                onChange={(e) => setEditZalba(e.target.value)}
                                                placeholder="npr. žalba podnesena VUSRH 15.11.2026."
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                              />
                                            </div>

                                            <div className="space-y-1">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Rješavatelj:
                                              </label>
                                              <input
                                                type="text"
                                                value={editRjesavatelj}
                                                onChange={(e) => setEditRjesavatelj(e.target.value)}
                                                placeholder="npr. Dino Malbaša"
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                              />
                                            </div>

                                            <div className="space-y-1 md:col-span-2">
                                              <label className="font-semibold text-slate-700 dark:text-slate-300">
                                                Dodatna zabilješka / Napomena o stanju postupka:
                                              </label>
                                              <textarea
                                                rows={2}
                                                value={editNapomena}
                                                onChange={(e) => setEditNapomena(e.target.value)}
                                                placeholder="Unesite internu napomenu ili specifičnost spora..."
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                              />
                                            </div>
                                          </div>

                                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <button
                                              type="button"
                                              onClick={() => setEditingSporId(null)}
                                              disabled={isSavingEdit}
                                              className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                                            >
                                              Odustani
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveSporEdit(spor)}
                                              disabled={isSavingEdit}
                                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                                            >
                                              {isSavingEdit ? (
                                                <>
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                  <span>Spremanje...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Check className="w-3.5 h-3.5" />
                                                  <span>💾 Spremi zabilješku</span>
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
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
                                              : spor.troskoviInfo?.status === 'poslan_nalog' || spor.troskoviInfo?.bojaOznake === 'smedje' || spor.troskoviInfo?.status === 'placeno'
                                              ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300/80 dark:border-emerald-800/80'
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
                                                  {spor.troskoviInfo.status === 'poslan_nalog' ||
                                                  spor.troskoviInfo.status === 'placeno' ||
                                                  spor.troskoviInfo.bojaOznake === 'smedje' ? (
                                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                                      🟢 Nalog poslan {spor.troskoviInfo.nalogDatum ? `${spor.troskoviInfo.nalogDatum} ` : ''}- plaćeno
                                                    </span>
                                                  ) : (
                                                    <span className="font-bold text-rose-600 dark:text-rose-400 animate-pulse">
                                                      🟡 Čeka nalog (žuto u tablici)
                                                    </span>
                                                  )}
                                                </div>

                                                <div className="flex items-center justify-between text-2xs">
                                                  <span className="text-slate-500">Evidencija u Excelu:</span>
                                                  <span className="font-mono text-slate-700 dark:text-slate-300">
                                                    {spor.troskoviInfo.bojaOznake === 'zuto'
                                                      ? '🟡 Žuto obojano (neplaćeno)'
                                                      : spor.troskoviInfo.bojaOznake === 'smedje'
                                                      ? '🟢 Smeđe obojano (nalog poslan - plaćeno)'
                                                      : spor.troskoviInfo.status === 'placeno'
                                                      ? '🟢 Plaćeno'
                                                      : 'Tekstualni zapis'}
                                                  </span>
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
                                              <p>
                                                <span className="text-slate-400">Akt UP/II po presudi:</span>{' '}
                                                {spor.aktUpIiPoPresudi ? (
                                                  <strong className="text-emerald-700 dark:text-emerald-400">{spor.aktUpIiPoPresudi}</strong>
                                                ) : (
                                                  <span className="text-slate-400 italic">Nije evidentirano</span>
                                                )}
                                              </p>
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
                                      )}
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

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => {
                            setActiveTab('pregled');
                            setSelectedSpor(spor);
                          }}
                          className="text-2xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Prikaži u tablici →
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `Želite li ukloniti predmet ${spor.poslovniBroj || spor.tuzitelj} iz aktivnih rokova?\n\n(Predmet neće više stvarati alarme na radaru rokova, a možete ga pregledati pod filtrom "Uklonjeni predmeti".)`
                              )
                            ) {
                              handleDismissSpor(spor, false);
                            }
                          }}
                          disabled={dismissingId === spor.id}
                          className="text-2xs font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Ukloni ovaj predmet s radara i iz aktivnih sporova"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Ukloni</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: UVOZ IZ E-KOMUNIKACIJE (KORAK 2 INTERAKTIVNA OBRADA) */}
          {activeTab === 'uvoz' && (
            <div className="space-y-6">
              {/* OBAVIJEST O USPJEHU / GREŠCI */}
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
                  {/* DROPZONE ZA DATOTEKE S E-KOMUNIKACIJE */}
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
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
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
                      <p className="text-2xs text-indigo-600 dark:text-indigo-400 font-semibold mt-2">
                        Kliknite ovdje za odabir datoteka s računala
                      </p>
                    </div>

                    {/* POPIS PRILOŽENIH DATOTEKA */}
                    {queuedFiles.length > 0 && (
                      <div className="p-4 bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
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

                  {/* BRZI ODABIR IZ POSTOJEĆIH MAPA NA ONEDRIVE-U */}
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
                            className="w-full text-left p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 transition-colors text-xs group"
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
                /* INTERAKTIVNI OBRAZAC ZA PREGLED I POTVRDU IZVUČENIH PODATAKA */
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
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 underline"
                    >
                      Poništi i učitaj drugi paket
                    </button>
                  </div>

                  {/* DETEKTIRANI DOKUMENTI PAKETA */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap gap-2 text-2xs">
                    <span className="font-semibold text-slate-500">Prepoznati akti:</span>
                    {extractedData.detektiraneDatoteke.potvrda && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-medium">
                        ✓ Potvrda primitka: {extractedData.detektiraneDatoteke.potvrda}
                      </span>
                    )}
                    {extractedData.detektiraneDatoteke.dopisNalog && (
                      <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-medium">
                        ✓ Nalog suda s rokom: {extractedData.detektiraneDatoteke.dopisNalog}
                      </span>
                    )}
                    {extractedData.detektiraneDatoteke.tuzba && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-medium">
                        ✓ Tužba: {extractedData.detektiraneDatoteke.tuzba}
                      </span>
                    )}
                  </div>

                  {/* POVEZANI PREDMET U BAZI */}
                  {extractedData.povezaniPredmet && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>Povezano s drugostupanjskim predmetom u bazi:</strong>{' '}
                        {extractedData.povezaniPredmet.klasa} ({extractedData.povezaniPredmet.stranka})
                      </span>
                    </div>
                  )}

                  {/* FORM FIELDS GRID */}
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

                  {/* AKCIJE */}
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
